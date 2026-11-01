/**
 * Automatic ortholinear routing for connections that are being drawn.
 *
 * The routing space is a half-grid of nodes (every 0.5 grid units, the
 * resolution the cursor snaps to). Each position holds up to two search states,
 * one per direction of travel, so A* can charge a penalty for every bend and so
 * prefers few-bend routes over staircases.
 *
 * Existing wires are never overlapped or touched. A route may only cross a
 * wire's interior straight and perpendicular, because a bend, an end or a
 * parallel run there would look like a connection (or hide one) in the diagram.
 * Its one exception is ending on the wire it connects to, at its interior or at
 * a bend or free end.
 */
import createGraph from 'ngraph.graph';
import { aStar } from 'ngraph.path';
import { cleanPath, elbowCorner } from './geometry.js';
const STEP = 0.5;
/** Cost of a bend, in half-grid steps. */
const BEND_COST = 4;
/** Extra cost, in half-grid steps, of crossing an obstacle or wire in a soft router. */
const SOFT_COST = 20;
/**
 * Extra cost, in half-grid steps, of each step onto a bus. A bus is treated
 * like elongated equipment: routes cross it only when going round costs more.
 */
const BUS_COST = 120;
/**
 * Extra cost, in half-grid steps, of each step onto a wire. A crossing pays it
 * on the way in and out, so routes cross a wire only when going round costs
 * more, but much more readily than they cross equipment or a bus.
 */
const WIRE_COST = 30;
/** Extra cost, in half-grid steps, of running along an equipment border in a tight router. */
const BORDER_COST = 3;
const FREE = 0;
const ON_HORIZONTAL_WIRE = 1;
const ON_VERTICAL_WIRE = 2;
const CLOSED = 3;
/** A bend or free end of a wire that a route may end on, but not pass. */
const VERTEX = 4;
const GOAL_ID = -1;
export class ConnectionRouter {
    /**
     * @param width - routing area width in grid units
     * @param height - routing area height in grid units
     * @param obstacles - rectangles routes may not enter or touch
     * @param wires - existing wires that routes must not overlap or touch
     * @param mode - how strictly to keep clear of what is in the way
     */
    constructor(width, height, obstacles, wires = [], mode = 'strict') {
        this.netGoals = new Map();
        this.reserved = new Set();
        this.cols = Math.round(width / STEP) + 1;
        this.rows = Math.round(height / STEP) + 1;
        this.cells = new Uint8Array(this.cols * this.rows);
        const penalty = new Uint8Array(this.cols * this.rows);
        obstacles.forEach(([x, y, w, h]) => {
            const ix0 = Math.max(0, Math.ceil(x / STEP));
            const ix1 = Math.min(this.cols - 1, Math.floor((x + w) / STEP));
            const iy0 = Math.max(0, Math.ceil(y / STEP));
            const iy1 = Math.min(this.rows - 1, Math.floor((y + h) / STEP));
            for (let iy = iy0; iy <= iy1; iy += 1) {
                for (let ix = ix0; ix <= ix1; ix += 1) {
                    const border = ix === ix0 || ix === ix1 || iy === iy0 || iy === iy1;
                    if (mode === 'tight' && border) {
                        penalty[iy * this.cols + ix] = BORDER_COST;
                    }
                    else {
                        this.cells[iy * this.cols + ix] = CLOSED;
                    }
                }
            }
        });
        this.markWires(wires, penalty);
        if (mode === 'soft') {
            this.cells.forEach((cell, i) => {
                penalty[i] = cell === FREE ? 0 : Math.max(penalty[i], SOFT_COST);
            });
            this.cells.fill(FREE);
        }
        this.penalty = penalty;
        this.graph = this.buildGraph();
    }
    id(ix, iy, axis) {
        return (iy * this.cols + ix) * 2 + axis;
    }
    cell(ix, iy) {
        return ix >= 0 && iy >= 0 && ix < this.cols && iy < this.rows
            ? this.cells[iy * this.cols + ix]
            : CLOSED;
    }
    hasState(ix, iy, axis) {
        const cell = this.cell(ix, iy);
        return (cell === FREE ||
            cell === VERTEX ||
            (cell === ON_HORIZONTAL_WIRE && axis === 1) ||
            (cell === ON_VERTICAL_WIRE && axis === 0));
    }
    /** Calls `visit` for each node strictly inside the orthogonal segment. */
    interior([x1, y1], [x2, y2], visit) {
        if (y1 === y2) {
            const iy = Math.round(y1 / STEP);
            const hi = Math.max(x1, x2);
            for (let ix = Math.floor(Math.min(x1, x2) / STEP) + 1; ix * STEP < hi; ix += 1) {
                visit(ix, iy, true);
            }
        }
        else if (x1 === x2) {
            const ix = Math.round(x1 / STEP);
            const hi = Math.max(y1, y2);
            for (let iy = Math.floor(Math.min(y1, y2) / STEP) + 1; iy * STEP < hi; iy += 1) {
                visit(ix, iy, false);
            }
        }
    }
    markWires(wires, penalty) {
        const setCell = (ix, iy, kind) => {
            if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) {
                return;
            }
            const i = iy * this.cols + ix;
            this.cells[i] = this.cells[i] === FREE || this.cells[i] === kind ? kind : CLOSED;
        };
        wires.forEach(({ points, bus = false }) => {
            points.slice(1).forEach((point, i) => {
                this.interior(points[i], point, (ix, iy, horizontal) => {
                    setCell(ix, iy, horizontal ? ON_HORIZONTAL_WIRE : ON_VERTICAL_WIRE);
                    if (this.cell(ix, iy) !== CLOSED) {
                        const at = iy * this.cols + ix;
                        penalty[at] = Math.max(penalty[at], bus ? BUS_COST : WIRE_COST);
                    }
                });
            });
        });
        // Bends and free ends can only be ended on, and only by their own net;
        // attachments, junctions and anything on another wire cannot be touched.
        const vertexNet = new Map();
        wires.forEach(({ net, points, terminals = [] }) => {
            points.forEach(([x, y]) => {
                const [ix, iy] = [Math.round(x / STEP), Math.round(y / STEP)];
                if (ix < 0 || iy < 0 || ix >= this.cols || iy >= this.rows) {
                    return;
                }
                const i = iy * this.cols + ix;
                const cell = this.cells[i];
                const free = cell === FREE || (cell === VERTEX && vertexNet.get(i) === net);
                if (!free || terminals.some(([tx, ty]) => tx === x && ty === y)) {
                    this.cells[i] = CLOSED;
                }
                else {
                    this.cells[i] = VERTEX;
                    vertexNet.set(i, net);
                }
            });
        });
        // Directions of the wire segments meeting at each position, and whether
        // they are all bus segments.
        const incident = new Map();
        wires.forEach(({ points, bus = false }) => points.slice(1).forEach((point, i) => {
            const axis = points[i][1] === point[1] ? 0 : 1;
            [points[i], point].forEach(([x, y]) => {
                const key = Math.round(y / STEP) * this.cols + Math.round(x / STEP);
                const meeting = incident.get(key) ?? { axes: [], bus: true };
                incident.set(key, {
                    axes: [...meeting.axes, axis],
                    bus: meeting.bus && bus,
                });
            });
        }));
        wires.forEach(({ net, points, bus = false }) => {
            const goals = this.netGoals.get(net) ?? {
                ids: [],
                boxes: [],
                vertices: new Map(),
                bus: new Map(),
            };
            this.netGoals.set(net, goals);
            points.slice(1).forEach((point, i) => {
                let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
                this.interior(points[i], point, (ix, iy, horizontal) => {
                    const kind = horizontal ? ON_HORIZONTAL_WIRE : ON_VERTICAL_WIRE;
                    if (this.cell(ix, iy) === kind) {
                        const goal = this.id(ix, iy, horizontal ? 1 : 0);
                        goals.ids.push(goal);
                        if (bus) {
                            goals.bus.set(iy * this.cols + ix, goal);
                        }
                        [minX, maxX] = [Math.min(minX, ix), Math.max(maxX, ix)];
                        [minY, maxY] = [Math.min(minY, iy), Math.max(maxY, iy)];
                    }
                });
                if (minX <= maxX) {
                    goals.boxes.push([minX, minY, maxX, maxY]);
                }
            });
            points.forEach(([x, y]) => {
                const [ix, iy] = [Math.round(x / STEP), Math.round(y / STEP)];
                const cellIndex = iy * this.cols + ix;
                if (this.cell(ix, iy) === VERTEX && !goals.vertices.has(cellIndex)) {
                    // A free end of a bus is met straight on, along its own direction.
                    const meeting = incident.get(cellIndex);
                    const axes = meeting?.bus && meeting.axes.length === 1 ? meeting.axes : [0, 1];
                    goals.vertices.set(cellIndex, axes.map(axis => this.id(ix, iy, axis)));
                }
            });
        });
    }
    stepCost(ix, iy, nx, ny) {
        return (1 +
            Math.max(this.penalty?.[iy * this.cols + ix] ?? 0, this.penalty?.[ny * this.cols + nx] ?? 0));
    }
    buildGraph() {
        const graph = createGraph();
        for (let iy = 0; iy < this.rows; iy += 1) {
            for (let ix = 0; ix < this.cols; ix += 1) {
                [0, 1].forEach((axis) => {
                    if (this.hasState(ix, iy, axis)) {
                        graph.addNode(this.id(ix, iy, axis), {
                            ix,
                            iy,
                            axis,
                            vertex: this.cell(ix, iy) === VERTEX,
                        });
                    }
                });
                if (this.cell(ix, iy) === FREE) {
                    graph.addLink(this.id(ix, iy, 0), this.id(ix, iy, 1), BEND_COST);
                }
                if (this.hasState(ix, iy, 0) && this.hasState(ix - 1, iy, 0)) {
                    graph.addLink(this.id(ix, iy, 0), this.id(ix - 1, iy, 0), this.stepCost(ix, iy, ix - 1, iy));
                }
                if (this.hasState(ix, iy, 1) && this.hasState(ix, iy - 1, 1)) {
                    graph.addLink(this.id(ix, iy, 1), this.id(ix, iy - 1, 1), this.stepCost(ix, iy, ix, iy - 1));
                }
            }
        }
        return graph;
    }
    /** Positions along the committed legs of the route being drawn. */
    occupied(own) {
        const keys = new Set();
        const add = (ix, iy) => keys.add(iy * this.cols + ix);
        own.forEach(([x, y], i) => {
            const [ix, iy] = [Math.round(x / STEP), Math.round(y / STEP)];
            add(ix, iy);
            if (i > 0) {
                const [px, py] = own[i - 1];
                const [pix, piy] = [Math.round(px / STEP), Math.round(py / STEP)];
                for (let a = Math.min(ix, pix); a <= Math.max(ix, pix); a += 1) {
                    add(a, iy === piy ? iy : piy);
                }
                for (let b = Math.min(iy, piy); b <= Math.max(iy, piy); b += 1) {
                    add(ix === pix ? ix : pix, b);
                }
            }
        });
        return keys;
    }
    /**
     * Keeps all later routes off the given polyline, crossings included.
     * @returns a function that lifts the reservation again
     */
    reserve(points) {
        const added = Array.from(this.occupied(points)).filter(key => !this.reserved.has(key));
        added.forEach(key => this.reserved.add(key));
        return () => added.forEach(key => this.reserved.delete(key));
    }
    /**
     * Routes an orthogonal path to a free point, avoiding obstacles and wires.
     *
     * @param from - where the route begins; snapped to the half-grid
     * @param heading - direction the connection is already travelling at `from`
     *   (components -1, 0 or 1). The route never doubles back along it. A zero
     *   heading leaves the initial direction free.
     * @param to - where the route ends; snapped to the half-grid
     * @param own - the legs already drawn for this connection, which the route
     *   must not touch
     * @returns the route's corner points from `from` to `to`, or `undefined`
     *   when no route exists
     */
    route(from, heading, to, own = []) {
        const goal = {
            kind: 'point',
            ix: Math.round(to[0] / STEP),
            iy: Math.round(to[1] / STEP),
        };
        if (this.cell(goal.ix, goal.iy) !== FREE) {
            return undefined;
        }
        return this.plan(from, heading, goal, own);
    }
    /**
     * Routes to the nearest place where the connection can meet the wires of
     * `net` (never along them) and ends there. Which point on the net that is
     * depends only on the route, so it is the same wherever on the net the user
     * pointed. The exceptions are pointing at one of its bends or free ends
     * (`at`), and at a bus bar, which are met there when they can be reached.
     */
    routeToNet(from, heading, net, own = [], at) {
        const goals = this.netGoals.get(net);
        if (!goals) {
            return undefined;
        }
        const atVertex = at ? this.routeToVertex(from, heading, net, at, own) : undefined;
        if (atVertex || !goals.ids.length) {
            return atVertex;
        }
        const onBus = at ? this.routeToBus(from, heading, net, at, own) : undefined;
        if (onBus) {
            return onBus;
        }
        return this.plan(from, heading, { kind: 'net', ids: goals.ids, boxes: goals.boxes }, own);
    }
    /** Routes to the bus bar of `net` at `at`, arriving straight on, or returns `undefined`. */
    routeToBus(from, heading, net, at, own = []) {
        const [ix, iy] = [Math.round(at[0] / STEP), Math.round(at[1] / STEP)];
        const id = this.netGoals.get(net)?.bus.get(iy * this.cols + ix);
        return id === undefined
            ? undefined
            : this.plan(from, heading, { kind: 'net', ids: [id], boxes: [[ix, iy, ix, iy]] }, own);
    }
    /**
     * Routes to a bend or free end of `net` and ends exactly there (free ends
     * straight on), or returns `undefined`.
     */
    routeToVertex(from, heading, net, at, own = []) {
        const [ix, iy] = [Math.round(at[0] / STEP), Math.round(at[1] / STEP)];
        const ids = this.netGoals.get(net)?.vertices.get(iy * this.cols + ix);
        return ids
            ? this.plan(from, heading, { kind: 'net', ids, boxes: [[ix, iy, ix, iy]] }, own)
            : undefined;
    }
    plan(from, heading, goal, own) {
        const [hx, hy] = heading;
        const startIx = Math.round(from[0] / STEP);
        const startIy = Math.round(from[1] / STEP);
        // A start on an obstacle's boundary (a terminal) can only be left along the
        // heading.
        const startFree = this.cell(startIx, startIy) !== CLOSED;
        const [ix, iy] = startFree
            ? [startIx, startIy]
            : [startIx + Math.sign(hx), startIy + Math.sign(hy)];
        if ((!startFree && hx === 0 && hy === 0) ||
            ix < 0 ||
            iy < 0 ||
            ix >= this.cols ||
            iy >= this.rows) {
            return undefined;
        }
        const occupied = this.occupied(own);
        this.reserved.forEach(key => occupied.add(key));
        occupied.delete(startIy * this.cols + startIx);
        occupied.delete(iy * this.cols + ix);
        // Without a heading, try starting in either direction.
        const axes = hx !== 0 ? [0] : hy !== 0 ? [1] : [1, 0];
        const best = axes
            .map(axis => this.search({ ix, iy, axis }, goal, startFree ? [hx, hy] : [0, 0], occupied))
            .filter((nodes) => !!nodes)
            .sort((a, b) => pathCost(a) - pathCost(b))[0];
        if (!best) {
            return undefined;
        }
        const points = best.reduce((acc, node) => {
            const point = [node.ix * STEP, node.iy * STEP];
            const last = acc[acc.length - 1];
            if (!last || last[0] !== point[0] || last[1] !== point[1]) {
                acc.push(point);
            }
            return acc;
        }, []);
        if (!startFree) {
            points.unshift([startIx * STEP, startIy * STEP]);
        }
        cleanPath(points);
        return points;
    }
    search(start, goal, noReverse, occupied) {
        const startId = this.id(start.ix, start.iy, start.axis);
        if (!this.graph.getNode(startId)) {
            return undefined;
        }
        const [hx, hy] = noReverse;
        const reverseId = this.id(start.ix - hx, start.iy - hy, start.axis);
        // The search ends at one fixed node: the horizontal state of a point, where
        // arriving vertically costs a bend that is cut off again below, or a
        // virtual node reachable from every place the net can be met.
        const goalId = goal.kind === 'point' ? this.id(goal.ix, goal.iy, 0) : GOAL_ID;
        if (goal.kind === 'net') {
            this.graph.addNode(GOAL_ID, { ix: -1, iy: -1, axis: 0 });
            goal.ids.forEach(id => this.graph.addLink(id, GOAL_ID, 0));
        }
        const goalIds = new Set(goal.kind === 'net' ? goal.ids : []);
        try {
            const finder = aStar(this.graph, {
                // Meeting the net is not crossing it, so arriving on it is free of the wire cost.
                distance: (_from, to, link) => goalIds.has(to.id)
                    ? link.data -
                        Math.min(this.penalty[to.data.iy * this.cols + to.data.ix], link.data - 1)
                    : link.data,
                heuristic: (a) => {
                    if (a.id === GOAL_ID) {
                        return 0;
                    }
                    const { ix, iy, axis } = a.data;
                    if (goal.kind === 'net') {
                        return Math.min(...goal.boxes.map(([x0, y0, x1, y1]) => Math.max(x0 - ix, 0, ix - x1) + Math.max(y0 - iy, 0, iy - y1)));
                    }
                    const dx = Math.abs(ix - goal.ix);
                    const dy = Math.abs(iy - goal.iy);
                    // At least one bend is needed when both directions must be covered,
                    // or when the remaining distance lies across the current direction.
                    const needsBend = (dx > 0 && dy > 0) ||
                        (axis === 0 && dx === 0 && dy > 0) ||
                        (axis === 1 && dy === 0 && dx > 0);
                    return dx + dy + (needsBend ? BEND_COST : 0);
                },
                // The first argument is the node being reached, the second the one it is
                // reached from. Bends and ends can only be ended on (or, for a start,
                // left).
                blocked: (a, b) => (a.data.vertex && !goalIds.has(a.id)) ||
                    (b.data.vertex && b.id !== startId && a.id !== GOAL_ID) ||
                    (a.data.ix >= 0 && occupied.has(a.data.iy * this.cols + a.data.ix)) ||
                    ((hx !== 0 || hy !== 0) &&
                        ((a.id === startId && b.id === reverseId) ||
                            (a.id === reverseId && b.id === startId))),
            });
            const found = finder.find(startId, goalId);
            if (!found.length || found[found.length - 1].id !== startId) {
                return undefined;
            }
            const nodes = found.map(node => node.data).reverse();
            if (goal.kind === 'net') {
                nodes.pop();
                return nodes;
            }
            const [last, beforeLast] = [nodes[nodes.length - 1], nodes[nodes.length - 2]];
            if (beforeLast && beforeLast.ix === last.ix && beforeLast.iy === last.iy) {
                nodes.pop();
            }
            return nodes;
        }
        finally {
            if (goal.kind === 'net') {
                this.graph.removeNode(GOAL_ID);
            }
        }
    }
}
function pathCost(nodes) {
    return nodes.slice(1).reduce((cost, node, i) => {
        const previous = nodes[i];
        const bend = previous.ix === node.ix && previous.iy === node.iy;
        return cost + (bend ? BEND_COST : 1);
    }, 0);
}
/**
 * Where a route for the connection being drawn begins: its last anchor, or, for
 * a connection only just started, the point where it leaves its terminal's
 * equipment, which lies outside any larger area the terminal sits in.
 */
export function connectAnchor(path) {
    return path.length === 2 ? path[1] : path[path.length - 2];
}
/**
 * The direction in which a connection path is currently travelling at its last
 * committed point (its second-to-last point). The final point is provisional
 * and only reveals that direction; as in {@link elbowCorner}, a segment is
 * vertical when both of its points share an x.
 */
export function connectHeading(path) {
    const [anchor, next] = path.slice(-2);
    return anchor[0] === next[0]
        ? [0, Math.sign(next[1] - anchor[1])]
        : [Math.sign(next[0] - anchor[0]), 0];
}
/**
 * The point half a grid step in front of a snap target's terminal edge (`far`),
 * on the side facing away from the equipment (`near` is the terminal end, which
 * lies inside it). A route ends here, then runs from `far` to `near`.
 */
export function snapApproachPoint(snap) {
    const { near, far } = snap;
    return [
        far[0] + Math.sign(far[0] - near[0]) * STEP,
        far[1] + Math.sign(far[1] - near[1]) * STEP,
    ];
}
/**
 * Completes a connection path with a route (followed by optional `tail`
 * points) replacing the provisional last point.
 */
export function finishRoute(path, route, ...tail) {
    const next = [...path.slice(0, -1), ...route, ...tail];
    cleanPath(next);
    return next;
}
/**
 * The path without the anchors that going to `target` would fold back over.
 * Going back onto a leg already drawn, or past its anchor, takes the anchors
 * after that point away instead of drawing over the way already drawn. The path
 * then carries on in the direction it was travelling at the point it is cut.
 */
export function backtrackPath(path, target) {
    const committed = path.slice(0, -1);
    if (committed.length < 2) {
        return path;
    }
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const carryOn = (kept, from, to) => {
        const end = kept[kept.length - 1];
        return [
            ...kept,
            [
                end[0] + Math.sign(to[0] - from[0]) * STEP,
                end[1] + Math.sign(to[1] - from[1]) * STEP,
            ],
        ];
    };
    // Onto a leg already drawn (the latest first), or back to one of its anchors.
    for (let i = committed.length - 2; i >= 0; i -= 1) {
        const [a, b] = [committed[i], committed[i + 1]];
        const onLeg = (a[0] === b[0] && target[0] === a[0] ||
            a[1] === b[1] && target[1] === a[1]) &&
            (target[0] - a[0]) * (target[0] - b[0]) <= 0 &&
            (target[1] - a[1]) * (target[1] - b[1]) <= 0;
        if (onLeg && !same(target, b)) {
            return same(target, a)
                ? carryOn(committed.slice(0, i + 1), ...(i > 0 ? [committed[i - 1], a] : [a, b]))
                : carryOn([...committed.slice(0, i + 1), target], a, b);
        }
        if (onLeg) {
            break;
        }
    }
    // Past the last anchor, along the way it was reached.
    const [anchor, heading] = [committed[committed.length - 1], connectHeading(path)];
    const behind = (target[0] - anchor[0]) * heading[0] + (target[1] - anchor[1]) * heading[1];
    if (behind >= 0) {
        return path;
    }
    const folded = [...committed, elbowCorner(path, target), target];
    for (let size = 0; size !== folded.length;) {
        size = folded.length;
        cleanPath(folded);
    }
    let keep = 0;
    while (keep + 1 < committed.length &&
        folded[keep + 1] &&
        same(folded[keep + 1], committed[keep + 1])) {
        keep += 1;
    }
    if (keep === committed.length - 1) {
        return path;
    }
    return carryOn(committed.slice(0, keep + 1), ...(keep > 0 ? [committed[keep - 1], committed[keep]] : committed));
}
/**
 * Commits a route into a connection that carries on: the route's end becomes
 * the new anchor, and a provisional point just ahead of it keeps the direction
 * of travel for the next route.
 */
export function extendRoute(path, route) {
    const next = finishRoute(path, route);
    const [previous, last] = next.slice(-2);
    next.push([
        last[0] + Math.sign(last[0] - previous[0]) * STEP,
        last[1] + Math.sign(last[1] - previous[1]) * STEP,
    ]);
    return next;
}
//# sourceMappingURL=routing.js.map