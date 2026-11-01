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
import { leaveRects, obstacleRects, windingPort } from './obstacles.js';
import { transformerWindingMeasures } from './transformer.js';
import { cleanPath } from './geometry.js';
import { ConnectionRouter } from './routing.js';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import {
  attributes,
  getSLDAttributes,
  setSLDAttributes,
  xmlBoolean,
} from './sld-attributes.js';
import { sldNs } from '../foundations.js';

import type { EditV2 } from '@openscd/oscd-api';
import type { Point } from './geometry.js';

/** What the user is changing: moving an element (and all it contains), turning equipment a quarter, mirroring a transformer or routing a wire through a point. */
export type LayoutChange =
  | { kind: 'move'; element: Element; dx: number; dy: number }
  | { kind: 'rotate'; element: Element }
  | { kind: 'flip'; element: Element }
  | { kind: 'section'; element: Element; via: Point };

/** Where a section meets its end: the point, the first point of a route there and the direction leaving it. */
export type Port = { point: Point; approach: Point; outward: Point };

export type End = {
  vertex: Element;
  port?: Port;
  terminal?: Element;
  /** The terminal's vertex is not where its terminal now is. */
  detached: boolean;
  /** Neither at a terminal nor joined to another wire. */
  free: boolean;
};

const STEP = 0.5;
const EPSILON = 1e-6;

const sameAs = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) < EPSILON && Math.abs(a[1] - b[1]) < EPSILON;

const heading = (from: Point, to: Point): Point => [
  Math.sign(to[0] - from[0]),
  Math.sign(to[1] - from[1]),
];

/** The point on the half-grid just beyond `point` in the direction `outward`. */
const snapOutward = (point: Point, outward: Point): Point => {
  const axis = outward[0] !== 0 ? 0 : 1;
  const snapped: Point = [...point];
  const scaled = point[axis] / STEP;
  snapped[axis] =
    (outward[axis] > 0 ? Math.ceil(scaled - EPSILON) : Math.floor(scaled + EPSILON)) *
    STEP;
  return snapped;
};

/** A quarter turn clockwise (the way `rot` increases), in a y-down plane. */
const quarterTurn = ([x, y]: Point): Point => [-y, x];

function layoutOf(change: LayoutChange) {
  const delta: Point =
    change.kind === 'move' ? [change.dx, change.dy] : [0, 0];
  const shifts = (element: Element) =>
    change.kind === 'move' && change.element.contains(element);
  const turns = (element: Element) =>
    change.kind === 'rotate' && change.element === element;
  const flips = (element: Element) =>
    change.kind === 'flip' && change.element === element;

  const shift = (element: Element): Point => (shifts(element) ? delta : [0, 0]);

  return {
    delta: shift,
    position(element: Element): Point {
      const {
        pos: [x, y],
      } = attributes(element);
      const [dx, dy] = shift(element);
      return [x + dx, y + dy];
    },
    rotation(element: Element): 0 | 1 | 2 | 3 {
      const { rot } = attributes(element);
      return turns(element) ? (((rot + 1) % 4) as 0 | 1 | 2 | 3) : rot;
    },
    turns,
    flips,
  };
}

type Layout = ReturnType<typeof layoutOf>;

/** Where a transformer terminal is once `layout` is applied, as drawn. */
function measuredPort(
  terminal: Element,
  transformer: Element,
  layout: Layout,
): Port | undefined {
  const winding = terminal.closest('TransformerWinding');
  if (!winding) {
    return undefined;
  }

  // Without terminals, all of the winding's terminal positions are measured.
  const windingsOf = (element: Element) =>
    Array.from(element.children).filter(c => c.tagName === 'TransformerWinding');
  const copy = transformer.cloneNode(true) as Element;
  copy.querySelectorAll('Terminal, NeutralPoint').forEach(t => t.remove());
  const attrs = attributes(transformer);
  const { center, terminals } = transformerWindingMeasures(
    windingsOf(copy)[windingsOf(transformer).indexOf(winding)],
    layout.position(transformer),
    {
      rot: layout.rotation(transformer),
      kind: attrs.kind,
      flip: layout.flips(transformer) ? !attrs.flip : attrs.flip,
    },
    '',
  );
  const point = terminals[terminal.getAttribute('name') as 'T1'];
  return point ? windingPort(center, point) : undefined;
}

/** Where a transformer terminal would be once its transformer is mirrored. */
export function flippedTerminalPort(terminal: Element): Port | undefined {
  const transformer = terminal.closest('PowerTransformer');
  return transformer
    ? measuredPort(terminal, transformer, layoutOf({ kind: 'flip', element: transformer }))
    : undefined;
}

function terminalPort(
  terminal: Element,
  oldVertex: Point,
  oldLeg: Point,
  layout: Layout,
): Port | undefined {
  const equipment = terminal.parentElement!;

  if (equipment.tagName === 'ConductingEquipment') {
    const name = terminal.getAttribute('name');
    if (name !== 'T1' && name !== 'T2') {
      return undefined;
    }
    const [close, far] = connectionPointsAt(
      layout.position(equipment),
      layout.rotation(equipment),
    )[name];
    return { point: close, approach: far, outward: heading(close, far) };
  }

  const transformer = terminal.closest('PowerTransformer');
  if (!transformer) {
    return undefined;
  }
  const measured = measuredPort(terminal, transformer, layout);
  if (measured) {
    return measured;
  }

  // Otherwise the whole transformer drawing moves and turns rigidly about its centre.
  const { pos } = attributes(transformer);
  const centre: Point = [pos[0] + 0.5, pos[1] + 0.5];
  const turned = layout.turns(transformer);
  const offset: Point = [oldVertex[0] - centre[0], oldVertex[1] - centre[1]];
  const [rx, ry] = turned ? quarterTurn(offset) : offset;
  const [dx, dy] = layout.delta(transformer);
  const point: Point = [centre[0] + rx + dx, centre[1] + ry + dy];

  // Leave away from the transformer, along the direction the wire used to.
  const leg = turned ? quarterTurn(oldLeg) : oldLeg;
  const away = offset[0] * oldLeg[0] + offset[1] * oldLeg[1] >= 0 ? 1 : -1;
  const outward: Point = [leg[0] * away, leg[1] * away];
  if (outward[0] === 0 && outward[1] === 0) {
    return undefined;
  }
  return { point, approach: snapOutward(point, outward), outward };
}

function describeEnd(
  vertices: Element[],
  index: number,
  layout: Layout,
  terminals: Map<string, Element>,
  joined: (vertex: Element) => boolean,
): End {
  const vertex = vertices[index];
  const inner = vertices[index === 0 ? 1 : vertices.length - 2];
  const oldVertex = attributes(vertex).pos;
  const oldLeg = heading(oldVertex, attributes(inner).pos);

  const uuid = getSLDAttributes(vertex, 'uuid');
  const terminal = uuid ? terminals.get(uuid) : undefined;
  const [dx, dy] = layout.delta(vertex);
  const vertexNow: Point = [oldVertex[0] + dx, oldVertex[1] + dy];

  if (!terminal) {
    return {
      vertex,
      port: {
        point: vertexNow,
        approach: vertexNow,
        outward: oldLeg,
      },
      detached: false,
      free: !joined(vertex),
    };
  }

  const port = terminalPort(terminal, oldVertex, oldLeg, layout);
  return {
    vertex,
    terminal,
    port,
    detached: !port || !sameAs(vertexNow, port.point),
    free: false,
  };
}

type Wire = {
  cNode: Element;
  section: Element;
  vertices: Element[];
  ends?: [End, End];
};

/** Every section of a substation with the ends it has under `layout`. */
function collectWires(substation: Element, layout: Layout): Wire[] {
  const terminals = new Map<string, Element>();
  Array.from(substation.querySelectorAll('Terminal, NeutralPoint')).forEach(
    (terminal) => {
      const uuid = getSLDAttributes(terminal, 'uuid');
      if (uuid) {
        terminals.set(uuid, terminal);
      }
    },
  );

  return Array.from(substation.querySelectorAll('ConnectivityNode')).flatMap(
    (cNode) => {
      const sections = Array.from(
        cNode.getElementsByTagNameNS(sldNs, 'Section'),
      );
      const key = (vertex: Element) => attributes(vertex).pos.join(',');
      const sectionsAt = new Map<string, Set<Element>>();
      sections.forEach(section =>
        Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).forEach(
          (vertex) => {
            const at = sectionsAt.get(key(vertex)) ?? new Set<Element>();
            sectionsAt.set(key(vertex), at.add(section));
          },
        ),
      );

      return sections.map((section) => {
        const vertices = Array.from(
          section.getElementsByTagNameNS(sldNs, 'Vertex'),
        );
        const joined = (vertex: Element) =>
          Array.from(sectionsAt.get(key(vertex)) ?? []).some(
            other => other !== section,
          );
        const wire: Wire = { cNode, section, vertices };
        if (vertices.length > 1) {
          wire.ends = [0, vertices.length - 1].map(index =>
            describeEnd(vertices, index, layout, terminals, joined),
          ) as [End, End];
        }
        return wire;
      });
    },
  );
}

/** How the ends of `section` are held; a free end is held by nothing. */
export function sectionEnds(section: Element): [End, End] | undefined {
  const substation = section.closest('Substation');
  return substation
    ? collectWires(substation, layoutOf({ kind: 'section', element: section, via: [0, 0] })).find(
      wire => wire.section === section,
    )?.ends
    : undefined;
}

/**
 * A route from one end of a section to the other. A `tight` router may turn on
 * an equipment border, so a route then ends on the border instead of in front
 * of it.
 */
function connect(
  router: ConnectionRouter,
  cNode: Element,
  from: End,
  to: End,
  tight: boolean,
  clear: (end: End, point: Point, outward: Point) => Point,
): Point[] | undefined {
  const { port: start } = from;
  const { port: end } = to;
  if (!start || !end) {
    return undefined;
  }
  const origin = clear(from, start.approach, start.outward);

  // A terminal reaches a junction on a wire like any other connection to it,
  // from whichever side is free.
  const viaVertex =
    from.terminal && !to.terminal
      ? router.routeToVertex(origin, start.outward, cNode, end.point)
      : undefined;
  if (viaVertex) {
    const points = [start.point, ...viaVertex];
    cleanPath(points);
    return points;
  }

  const route = router.route(
    origin,
    start.outward,
    tight && to.terminal
      ? end.approach
      : clear(to, stubOf(end), end.outward),
  );
  if (!route) {
    return undefined;
  }
  const points = [start.point, ...route, end.approach, end.point];
  cleanPath(points);
  return points;
}

/** The first free point in front of a port. */
const stubOf = ({ approach, outward }: Port): Point => [
  approach[0] + outward[0] * STEP,
  approach[1] + outward[1] * STEP,
];

/** The direction a route arrives in, or `otherwise` when it is a single point. */
const arrival = (route: Point[], otherwise: Point): Point =>
  route.length > 1
    ? heading(route[route.length - 2], route[route.length - 1])
    : otherwise;

/** The route from one end of a section to the other that passes through `via`. */
function connectVia(
  router: ConnectionRouter,
  cNode: Element,
  from: End,
  to: End,
  via: Point,
  tight: boolean,
  clear: (end: End, point: Point, outward: Point) => Point,
): Point[] | undefined {
  const { port: start } = from;
  const { port: end } = to;
  if (!start || !end) {
    return undefined;
  }

  const origin = from.terminal
    ? clear(from, start.approach, start.outward)
    : start.point;
  const first = router.route(origin, start.outward, via);
  if (!first) {
    return undefined;
  }
  const own: Point[] = [start.point, ...first];
  const turned = arrival(first, start.outward);
  const last = to.terminal
    ? router.route(
      via,
      turned,
      tight ? end.approach : clear(to, stubOf(end), end.outward),
      own,
    )
    : router.routeToVertex(via, turned, cNode, end.point, own);
  if (!last) {
    return undefined;
  }
  const points = [
    start.point,
    ...first,
    ...last,
    ...(to.terminal ? [end.approach, end.point] : []),
  ];
  cleanPath(points);
  return points;
}

/** A route through `via` that goes through whatever is in the way when it has to. */
function connectThroughVia(
  soft: ConnectionRouter,
  start: Port,
  end: Port,
  via: Point,
): Point[] {
  const elbow = (from: Point, outward: Point, to: Point): Point[] => [
    from,
    outward[0] !== 0 ? [to[0], from[1]] : [from[0], to[1]],
    to,
  ];
  const routed = soft.route(start.point, start.outward, via);
  const first = routed
    ? [start.point, ...routed]
    : elbow(start.point, start.outward, via);
  const turned = arrival(first, start.outward);
  const last =
    soft.route(via, turned, stubOf(end)) ?? elbow(via, turned, stubOf(end));
  const points = [...first, ...last, end.approach, end.point];
  cleanPath(points);
  return points;
}

/** A route that goes through whatever is in the way when it has to. */
function connectThrough(soft: ConnectionRouter, start: Port, end: Port): Point[] {
  const route = soft.route(start.point, start.outward, stubOf(end));
  const points = route
    ? [start.point, ...route, end.approach, end.point]
    : directPath(start, end);
  cleanPath(points);
  return points;
}

/** An elbow between the two ports' stubs; it ignores everything else. */
function directPath(start: Port, end: Port): Point[] {
  const [sx, sy] = stubOf(start);
  const [ex, ey] = stubOf(end);
  const corner: Point = start.outward[0] !== 0 ? [ex, sy] : [sx, ey];
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

/** A section's new geometry. A `fallback` runs through other elements. */
export type PlannedRoute = {
  section: Element;
  cNode: Element;
  points: Point[];
  fallback: boolean;
  vertices: Element[];
  ends: [End, End];
};

/** Compares a section's geometry, e.g. to tell whether it has changed since it was planned. */
export function pointsSignature(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

export function sectionSignature(section: Element): string {
  return pointsSignature(
    Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(
      vertex => attributes(vertex).pos,
    ),
  );
}

/** Whether two routes run along each other over more than a point. */
function runAlong(a: Point[], b: Point[]): boolean {
  const legs = (points: Point[]) =>
    points.slice(1).map((end, i): [Point, Point] => [points[i], end]);
  return legs(a).some(([p, q]) =>
    legs(b).some(([r, t]) =>
      ([0, 1] as const).some((axis) => {
        const across = 1 - axis;
        return (
          [q, r, t].every(point => point[across] === p[across]) &&
          Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], t[axis])) <
            Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], t[axis]))
        );
      }),
    ),
  );
}

/** A section that runs through other elements, with the geometry it has. */
export type FlaggedSection = Pick<PlannedRoute, 'section' | 'points'>;

/** Sections not in `skip` that `change` leaves running through equipment, one of them having moved. */
export function overlappedSections(
  doc: XMLDocument,
  change: LayoutChange,
  skip: Set<Element>,
): FlaggedSection[] {
  const substation = change.element.closest('Substation');
  if (
    !substation ||
    change.element.getRootNode() !== doc ||
    change.element.localName === 'Vertex'
  ) {
    return [];
  }
  const layout = layoutOf(change);
  const moves = (element: Element) =>
    change.kind === 'move' && change.element.contains(element);

  const boxes = [
    ...Array.from(
      substation.querySelectorAll('ConductingEquipment, PowerTransformer'),
    ),
    ...iedReferences(substation),
  ].flatMap(element =>
    obstacleRects(element, layout.position(element)).map(rect => ({
      element,
      moved: moves(element),
      rect,
    })),
  );
  const owners = new Map<string, Element | null>();
  Array.from(substation.querySelectorAll('Terminal, NeutralPoint')).forEach(
    (terminal) => {
      const uuid = getSLDAttributes(terminal, 'uuid');
      if (uuid) {
        owners.set(
          uuid,
          terminal.closest('ConductingEquipment, PowerTransformer'),
        );
      }
    },
  );

  return Array.from(substation.querySelectorAll('ConnectivityNode'))
    .flatMap(cNode =>
      Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')),
    )
    .filter(section => !skip.has(section))
    .flatMap((section): FlaggedSection[] => {
      const vertices = Array.from(
        section.getElementsByTagNameNS(sldNs, 'Vertex'),
      );
      const points = vertices.map((vertex): Point => {
        const [x, y] = attributes(vertex).pos;
        const [dx, dy] = layout.delta(vertex);
        return [x + dx, y + dy];
      });
      const attached = new Set(
        vertices.map(vertex => owners.get(getSLDAttributes(vertex, 'uuid') ?? '')),
      );
      const through = boxes.some(
        ({ element, moved, rect: [x, y, w, h] }) =>
          (moved || moves(section)) &&
          !attached.has(element) &&
          points.slice(1).some((end, i) => {
            const start = points[i];
            return (
              Math.max(start[0], end[0]) > x &&
              Math.min(start[0], end[0]) < x + w &&
              Math.max(start[1], end[1]) > y &&
              Math.min(start[1], end[1]) < y + h
            );
          }),
      );
      return through ? [{ section, points }] : [];
    });
}

/**
 * Where the sections left off their terminals by `change` would run
 * afterwards. Nothing is changed in the document.
 */
export function planReroutes(
  doc: XMLDocument,
  change: LayoutChange,
): PlannedRoute[] {
  const substation = change.element.closest('Substation');
  if (
    !substation ||
    change.element.getRootNode() !== doc ||
    change.element.localName === 'Vertex'
  ) {
    return [];
  }
  const layout = layoutOf(change);
  const wires = collectWires(substation, layout);

  const affected =
    change.kind === 'section'
      ? wires.filter(
        wire =>
          wire.section === change.element &&
          !xmlBoolean(getSLDAttributes(wire.section, 'bus')) &&
          wire.ends?.every(end => end.port && !end.free),
      )
      : wires.filter(
        wire =>
          wire.ends?.some(end => end.detached) &&
          wire.ends.every(end => end.port),
      );
  if (!affected.length) {
    return [];
  }

  const unchanged = wires.filter(wire => !affected.includes(wire));
  const obstacles = [
    ...Array.from(
      substation.querySelectorAll('ConductingEquipment, PowerTransformer'),
    ),
    ...iedReferences(substation),
  ].flatMap(element =>
    obstacleRects(element, layout.position(element), layout.rotation(element)),
  );
  /** Moves a port's point out of the areas of the transformer it belongs to. */
  const clearOfOwn = (end: End, point: Point, outward: Point): Point => {
    const transformer = end.terminal?.closest('PowerTransformer');
    return transformer
      ? leaveRects(
        point,
        outward,
        obstacleRects(
          transformer,
          layout.position(transformer),
          layout.rotation(transformer),
        ),
      )
      : point;
  };
  const {
    dim: [width, height],
  } = attributes(substation);
  const existing = unchanged.map(({ cNode, section, vertices }) => {
    const points = vertices.map((vertex): Point => {
      const [x, y] = attributes(vertex).pos;
      const [dx, dy] = layout.delta(vertex);
      return [x + dx, y + dy];
    });
    return {
      net: cNode,
      bus: xmlBoolean(getSLDAttributes(section, 'bus')),
      points,
      terminals: points.filter((_, i) =>
        getSLDAttributes(vertices[i], 'uuid'),
      ),
    };
  });
  const router = new ConnectionRouter(width, height, obstacles, existing);
  const tightRouter = new ConnectionRouter(
    width,
    height,
    obstacles,
    existing,
    'tight',
  );
  let softRouter: ConnectionRouter | undefined;
  const through = (start: Port, end: Port) => {
    softRouter ??= new ConnectionRouter(
      width,
      height,
      obstacles,
      existing,
      'soft',
    );
    return change.kind === 'section'
      ? connectThroughVia(softRouter, start, end, change.via)
      : connectThrough(softRouter, start, end);
  };
  const reserve = (points: Point[]) => {
    const releases = [router.reserve(points), tightRouter.reserve(points)];
    return () => releases.forEach(release => release());
  };

  /** Plans every wire of a group in order; routes that keep clear reserve their way. */
  const planGroup = (group: Wire[]) => {
    const releases: (() => void)[] = [];

    // The access to every end is kept free until its own section is routed.
    const access = group.map(({ ends }) =>
      ends!.map(({ port }) => reserve([stubOf(port!)])),
    );

    const routes = group.map(
      ({ cNode, section, vertices, ends }, index): PlannedRoute => {
        access[index].forEach(release => release());
        const [first, last] = ends!;

        // Turning on an equipment border is only for when there is no room
        // to leave straight.
        let points: Point[] | undefined;
        [
          [router, false],
          [tightRouter, true],
        ].some(([candidate, tight]) =>
          [
            [first, last],
            [last, first],
          ].some(([from, to], attempt) => {
            const found =
              change.kind === 'section'
                ? connectVia(
                  candidate as ConnectionRouter,
                  cNode,
                  from,
                  to,
                  change.via,
                  tight as boolean,
                  clearOfOwn,
                )
                : connect(
                  candidate as ConnectionRouter,
                  cNode,
                  from,
                  to,
                  tight as boolean,
                  clearOfOwn,
                );
            if (found) {
              points = attempt === 0 ? found : found.reverse();
            }
            return !!found;
          }),
        );
        if (points) {
          releases.push(reserve(points));
        }
        return {
          section,
          cNode,
          vertices,
          ends: ends!,
          points: points ?? through(first.port!, last.port!),
          fallback: !points,
        };
      },
    );

    access.flat().forEach(release => release());
    return {
      routes,
      fallbacks: routes.filter(route => route.fallback).length,
      release: () => releases.forEach(release => release()),
    };
  };

  const plans = Array.from(new Set(affected.map(wire => wire.cNode))).flatMap(
    (cNode) => {
      const group = affected.filter(wire => wire.cNode === cNode);

      // The access to ends of other connections stays free while this one is routed.
      const guards = affected
        .filter(wire => !group.includes(wire))
        .flatMap(({ ends }) => ends!.map(({ port }) => reserve([stubOf(port!)])));
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
    },
  );

  // A route that runs along one going through other elements is just as
  // ambiguous, whichever of them was planned first.
  let spreading = true;
  while (spreading) {
    spreading = false;
    plans.forEach((route) => {
      if (
        !route.fallback &&
        plans.some(
          other => other.fallback && runAlong(route.points, other.points),
        )
      ) {
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
export function rerouteEdits(
  doc: XMLDocument,
  change: LayoutChange,
  nsp: string,
  fallbacks: FlaggedSection[] = [],
): EditV2[] {
  const routes = planReroutes(doc, change);
  fallbacks.push(
    ...overlappedSections(doc, change, new Set(routes.map(r => r.section))),
  );
  return routes.flatMap((route) => {
    const { section, vertices, ends, points } = route;
    if (route.fallback) {
      fallbacks.push(route);
    }

    const edits: EditV2[] = [];
    ends.forEach((end, i) => {
      if (end.detached) {
        const [x, y] = points[i === 0 ? 0 : points.length - 1];
        edits.push(
          updateSLDAttributes(end.vertex, nsp, {
            x: x.toString(),
            y: y.toString(),
          }),
        );
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
