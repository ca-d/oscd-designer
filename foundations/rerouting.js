/**
 * Keeps connections attached when equipment or containers are moved or rotated.
 *
 * A connection is a section of vertices. Where it ends on equipment its end
 * vertex carries the terminal's uuid and must sit on the terminal; its other end
 * is a junction on the connectivity node's wires (or on more equipment). When
 * a change leaves a terminal vertex off its terminal, the section is routed
 * anew between its ends, around everything else and without touching other
 * wires. Where no such route exists it is routed through whatever is in the way
 * instead, so a connection is never lost to a move; those sections are reported
 * as fallbacks.
 */
import { connectionPointsAt } from './connectivity.js';
import { iedReferences } from './ied.js';
import { cleanPath } from './geometry.js';
import { ConnectionRouter } from './routing.js';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import { attributes, getSLDAttributes, setSLDAttributes, xmlBoolean, } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
const STEP = 0.5;
const EPSILON = 1e-6;
const sameAs = (a, b) => Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;
const heading = (from, to) => [
    Math.sign(to[0] - from[0]),
    Math.sign(to[1] - from[1]),
];
const halfGrid = ([x, y]) => [
    Math.round(x / STEP) * STEP,
    Math.round(y / STEP) * STEP,
];
/** A quarter turn clockwise (the way `rot` increases), in a y-down plane. */
const quarterTurn = ([x, y]) => [-y, x];
function layoutOf(change) {
    const delta = change.kind === 'move' ? [change.dx, change.dy] : [0, 0];
    const shifts = (element) => change.kind === 'move' && change.element.contains(element);
    const turns = (element) => change.kind === 'rotate' && change.element === element;
    const shift = (element) => (shifts(element) ? delta : [0, 0]);
    return {
        delta: shift,
        position(element) {
            const { pos: [x, y], } = attributes(element);
            const [dx, dy] = shift(element);
            return [x + dx, y + dy];
        },
        rotation(element) {
            const { rot } = attributes(element);
            return turns(element) ? ((rot + 1) % 4) : rot;
        },
        turns,
    };
}
function terminalPort(terminal, oldVertex, oldLeg, layout) {
    const equipment = terminal.parentElement;
    if (equipment.tagName === 'ConductingEquipment') {
        const name = terminal.getAttribute('name');
        if (name !== 'T1' && name !== 'T2') {
            return undefined;
        }
        const [close, far] = connectionPointsAt(layout.position(equipment), layout.rotation(equipment))[name];
        return { point: close, approach: far, outward: heading(close, far) };
    }
    const transformer = terminal.closest('PowerTransformer');
    if (!transformer) {
        return undefined;
    }
    // The whole transformer drawing moves and turns rigidly about its centre.
    const { pos } = attributes(transformer);
    const centre = [pos[0] + 0.5, pos[1] + 0.5];
    const turned = layout.turns(transformer);
    const offset = [oldVertex[0] - centre[0], oldVertex[1] - centre[1]];
    const [rx, ry] = turned ? quarterTurn(offset) : offset;
    const [dx, dy] = layout.delta(transformer);
    const point = [centre[0] + rx + dx, centre[1] + ry + dy];
    // Leave away from the transformer, along the direction the wire used to.
    const leg = turned ? quarterTurn(oldLeg) : oldLeg;
    const away = offset[0] * oldLeg[0] + offset[1] * oldLeg[1] >= 0 ? 1 : -1;
    const outward = [leg[0] * away, leg[1] * away];
    if (outward[0] === 0 && outward[1] === 0) {
        return undefined;
    }
    return { point, approach: halfGrid(point), outward };
}
function describeEnd(vertices, index, layout, terminals) {
    const vertex = vertices[index];
    const inner = vertices[index === 0 ? 1 : vertices.length - 2];
    const oldVertex = attributes(vertex).pos;
    const oldLeg = heading(oldVertex, attributes(inner).pos);
    const uuid = getSLDAttributes(vertex, 'uuid');
    const terminal = uuid ? terminals.get(uuid) : undefined;
    const [dx, dy] = layout.delta(vertex);
    const vertexNow = [oldVertex[0] + dx, oldVertex[1] + dy];
    if (!terminal) {
        return {
            vertex,
            port: {
                point: vertexNow,
                approach: vertexNow,
                outward: oldLeg,
            },
            detached: false,
        };
    }
    const port = terminalPort(terminal, oldVertex, oldLeg, layout);
    return {
        vertex,
        terminal,
        port,
        detached: !port || !sameAs(vertexNow, port.point),
    };
}
/**
 * A route from one end of a section to the other. A `tight` router may turn on
 * an equipment border, so a route then ends on the border instead of in front
 * of it.
 */
function connect(router, cNode, from, to, tight) {
    const { port: start } = from;
    const { port: end } = to;
    if (!start || !end) {
        return undefined;
    }
    // A terminal reaches a junction on a wire like any other connection to it,
    // from whichever side is free.
    const viaVertex = from.terminal && !to.terminal
        ? router.routeToVertex(start.point, start.outward, cNode, end.point)
        : undefined;
    if (viaVertex) {
        const points = [start.point, ...viaVertex];
        cleanPath(points);
        return points;
    }
    const route = router.route(start.point, start.outward, tight && to.terminal ? end.approach : stubOf(end));
    if (!route) {
        return undefined;
    }
    const points = [start.point, ...route, end.approach, end.point];
    cleanPath(points);
    return points;
}
/** The first free point in front of a port. */
const stubOf = ({ approach, outward }) => [
    approach[0] + outward[0] * STEP,
    approach[1] + outward[1] * STEP,
];
/** A route that goes through whatever is in the way when it has to. */
function connectThrough(soft, start, end) {
    const route = soft.route(start.point, start.outward, stubOf(end));
    const points = route
        ? [start.point, ...route, end.approach, end.point]
        : directPath(start, end);
    cleanPath(points);
    return points;
}
/** An elbow between the two ports' stubs; it ignores everything else. */
function directPath(start, end) {
    const [sx, sy] = stubOf(start);
    const [ex, ey] = stubOf(end);
    const corner = start.outward[0] !== 0 ? [ex, sy] : [sx, ey];
    return [
        start.point,
        start.approach,
        [sx, sy],
        corner,
        [ex, ey],
        end.approach,
        end.point,
    ];
}
/** Compares a section's geometry, e.g. to tell whether it has changed since it was planned. */
export function pointsSignature(points) {
    return points.map(([x, y]) => `${x},${y}`).join(' ');
}
export function sectionSignature(section) {
    return pointsSignature(Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(vertex => attributes(vertex).pos));
}
/** Whether two routes run along each other over more than a point. */
function runAlong(a, b) {
    const legs = (points) => points.slice(1).map((end, i) => [points[i], end]);
    return legs(a).some(([p, q]) => legs(b).some(([r, t]) => [0, 1].some((axis) => {
        const across = 1 - axis;
        return ([q, r, t].every(point => point[across] === p[across]) &&
            Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], t[axis])) <
                Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], t[axis])));
    })));
}
/** Sections not in `skip` that `change` leaves running through equipment, one of them having moved. */
export function overlappedSections(doc, change, skip) {
    const substation = change.element.closest('Substation');
    if (!substation ||
        change.element.getRootNode() !== doc ||
        change.element.localName === 'Vertex') {
        return [];
    }
    const layout = layoutOf(change);
    const moves = (element) => change.kind === 'move' && change.element.contains(element);
    const boxes = [
        ...Array.from(substation.querySelectorAll('ConductingEquipment, PowerTransformer')),
        ...iedReferences(substation),
    ].map((element) => {
        const [x, y] = layout.position(element);
        const { dim: [w, h], } = attributes(element);
        return { element, moved: moves(element), rect: [x, y, w, h] };
    });
    const owners = new Map();
    Array.from(substation.querySelectorAll('Terminal, NeutralPoint')).forEach((terminal) => {
        const uuid = getSLDAttributes(terminal, 'uuid');
        if (uuid) {
            owners.set(uuid, terminal.closest('ConductingEquipment, PowerTransformer'));
        }
    });
    return Array.from(substation.querySelectorAll('ConnectivityNode'))
        .flatMap(cNode => Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')))
        .filter(section => !skip.has(section))
        .flatMap((section) => {
        const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
        const points = vertices.map((vertex) => {
            const [x, y] = attributes(vertex).pos;
            const [dx, dy] = layout.delta(vertex);
            return [x + dx, y + dy];
        });
        const attached = new Set(vertices.map(vertex => owners.get(getSLDAttributes(vertex, 'uuid') ?? '')));
        const through = boxes.some(({ element, moved, rect: [x, y, w, h] }) => (moved || moves(section)) &&
            !attached.has(element) &&
            points.slice(1).some((end, i) => {
                const start = points[i];
                return (Math.max(start[0], end[0]) > x &&
                    Math.min(start[0], end[0]) < x + w &&
                    Math.max(start[1], end[1]) > y &&
                    Math.min(start[1], end[1]) < y + h);
            }));
        return through ? [{ section, points }] : [];
    });
}
/**
 * Where the sections left off their terminals by `change` would run
 * afterwards. Nothing is changed in the document.
 */
export function planReroutes(doc, change) {
    const substation = change.element.closest('Substation');
    if (!substation ||
        change.element.getRootNode() !== doc ||
        change.element.localName === 'Vertex') {
        return [];
    }
    const layout = layoutOf(change);
    const terminals = new Map();
    Array.from(substation.querySelectorAll('Terminal, NeutralPoint')).forEach((terminal) => {
        const uuid = getSLDAttributes(terminal, 'uuid');
        if (uuid) {
            terminals.set(uuid, terminal);
        }
    });
    const wires = Array.from(substation.querySelectorAll('ConnectivityNode')).flatMap(cNode => Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')).map((section) => {
        const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
        const wire = { cNode, section, vertices };
        if (vertices.length > 1) {
            wire.ends = [0, vertices.length - 1].map(index => describeEnd(vertices, index, layout, terminals));
        }
        return wire;
    }));
    const affected = wires.filter(wire => wire.ends?.some(end => end.detached) &&
        wire.ends.every(end => end.port));
    if (!affected.length) {
        return [];
    }
    const unchanged = wires.filter(wire => !affected.includes(wire));
    const ownTransformers = new Set(affected.flatMap(wire => (wire.ends ?? []).map(end => end.terminal?.closest('PowerTransformer'))));
    const obstacles = [
        ...Array.from(substation.querySelectorAll('ConductingEquipment, PowerTransformer')),
        ...iedReferences(substation),
    ]
        .filter(element => !ownTransformers.has(element))
        .map((element) => {
        const [x, y] = layout.position(element);
        const { dim: [w, h], } = attributes(element);
        return [x, y, w, h];
    });
    const { dim: [width, height], } = attributes(substation);
    const existing = unchanged.map(({ cNode, section, vertices }) => {
        const points = vertices.map((vertex) => {
            const [x, y] = attributes(vertex).pos;
            const [dx, dy] = layout.delta(vertex);
            return [x + dx, y + dy];
        });
        return {
            net: cNode,
            bus: xmlBoolean(getSLDAttributes(section, 'bus')),
            points,
            terminals: points.filter((_, i) => getSLDAttributes(vertices[i], 'uuid')),
        };
    });
    const router = new ConnectionRouter(width, height, obstacles, existing);
    const tightRouter = new ConnectionRouter(width, height, obstacles, existing, 'tight');
    let softRouter;
    const through = (start, end) => {
        softRouter ??= new ConnectionRouter(width, height, obstacles, existing, 'soft');
        return connectThrough(softRouter, start, end);
    };
    const reserve = (points) => {
        const releases = [router.reserve(points), tightRouter.reserve(points)];
        return () => releases.forEach(release => release());
    };
    /** Plans every wire of a group in order; routes that keep clear reserve their way. */
    const planGroup = (group) => {
        const releases = [];
        // The access to every end is kept free until its own section is routed.
        const access = group.map(({ ends }) => ends.map(({ port }) => reserve([stubOf(port)])));
        const routes = group.map(({ cNode, section, vertices, ends }, index) => {
            access[index].forEach(release => release());
            const [first, last] = ends;
            // Turning on an equipment border is only for when there is no room
            // to leave straight.
            let points;
            [
                [router, false],
                [tightRouter, true],
            ].some(([candidate, tight]) => [
                [first, last],
                [last, first],
            ].some(([from, to], attempt) => {
                const found = connect(candidate, cNode, from, to, tight);
                if (found) {
                    points = attempt === 0 ? found : found.reverse();
                }
                return !!found;
            }));
            if (points) {
                releases.push(reserve(points));
            }
            return {
                section,
                cNode,
                vertices,
                ends: ends,
                points: points ?? through(first.port, last.port),
                fallback: !points,
            };
        });
        access.flat().forEach(release => release());
        return {
            routes,
            fallbacks: routes.filter(route => route.fallback).length,
            release: () => releases.forEach(release => release()),
        };
    };
    const plans = Array.from(new Set(affected.map(wire => wire.cNode))).flatMap((cNode) => {
        const group = affected.filter(wire => wire.cNode === cNode);
        // The access to ends of other connections stays free while this one is routed.
        const guards = affected
            .filter(wire => !group.includes(wire))
            .flatMap(({ ends }) => ends.map(({ port }) => reserve([stubOf(port)])));
        let plan = planGroup(group);
        // Sections that meet are routed one after the other, so the order can
        // decide whether each of them finds room.
        if (plan.fallbacks && group.length > 1) {
            const forward = plan.fallbacks;
            plan.release();
            const reverse = planGroup([...group].reverse());
            reverse.release();
            plan = planGroup(reverse.fallbacks < forward ? [...group].reverse() : group);
        }
        guards.forEach(release => release());
        return plan.routes;
    });
    // A route that runs along one going through other elements is just as
    // ambiguous, whichever of them was planned first.
    let spreading = true;
    while (spreading) {
        spreading = false;
        plans.forEach((route) => {
            if (!route.fallback &&
                plans.some(other => other.fallback && runAlong(route.points, other.points))) {
                route.fallback = true;
                spreading = true;
            }
        });
    }
    return plans;
}
/**
 * Edits that keep every connection attached after `change`, rerouting the
 * sections whose terminals are no longer where their wires end. Sections that
 * had to run through other elements, or that the change leaves running through
 * equipment, are added to `fallbacks`.
 */
export function rerouteEdits(doc, change, nsp, fallbacks = []) {
    const routes = planReroutes(doc, change);
    fallbacks.push(...overlappedSections(doc, change, new Set(routes.map(r => r.section))));
    return routes.flatMap((route) => {
        const { section, vertices, ends, points } = route;
        if (route.fallback) {
            fallbacks.push(route);
        }
        const edits = [];
        ends.forEach((end, i) => {
            if (end.detached) {
                const [x, y] = points[i === 0 ? 0 : points.length - 1];
                edits.push(updateSLDAttributes(end.vertex, nsp, {
                    x: x.toString(),
                    y: y.toString(),
                }));
            }
        });
        vertices.slice(1, -1).forEach(vertex => edits.push({ node: vertex }));
        points.slice(1, -1).forEach(([x, y]) => {
            const vertex = doc.createElementNS(sldNs, `${nsp}:Vertex`);
            setSLDAttributes(vertex, nsp, { x: x.toString(), y: y.toString() });
            edits.push({
                parent: section,
                node: vertex,
                reference: vertices[vertices.length - 1],
            });
        });
        return edits;
    });
}
//# sourceMappingURL=rerouting.js.map