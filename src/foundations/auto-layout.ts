/**
 * A first single line diagram for a substation that has none yet.
 *
 * Voltage levels are stacked one below the other. In each, bays that only
 * hold a connectivity node become bus bars across its top, and the other bays
 * are lined up below them. Within a bay, equipment connected to each other is
 * placed close together: each row holds what is one connection further away
 * from where the bay is fed, with one free cell around every item.
 * Transformers outside of bays go to the right of their voltage level or of
 * the whole substation. Connections are then drawn one by one, the shortest
 * first, each joining the wires of its connectivity node drawn so far.
 */

import { getReference } from '@openscd/scl-lib';

import { privType, sldNs, uuid } from '../foundations.js';
import { cleanPath } from './geometry.js';
import { leaveRects, obstacleRects } from './obstacles.js';
import { terminalPortAt } from './rerouting.js';
import { ConnectionRouter } from './routing.js';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import { getSLDAttributes, setSLDAttributes } from './sld-attributes.js';

import type { EditV2 } from '@openscd/oscd-api';
import type { Port } from './rerouting.js';
import type { Point, Rect } from './geometry.js';
import type { RouterMode } from './routing.js';

const STEP = 0.5;

const laidOut = 'VoltageLevel, Bay, ConductingEquipment, PowerTransformer';

/** Whether none of the containers and equipment of `substation` has been placed yet. */
export function needsLayout(substation: Element): boolean {
  const elements = Array.from(substation.querySelectorAll(laidOut));
  return (
    elements.length > 0 &&
    elements.every(
      element =>
        getSLDAttributes(element, 'x') === null &&
        getSLDAttributes(element, 'y') === null,
    )
  );
}

const childrenOf = (element: Element, tag: string) =>
  Array.from(element.children).filter(child => child.tagName === tag);

const terminalsOf = (element: Element) =>
  Array.from(element.querySelectorAll('Terminal, NeutralPoint'));

const isGrounded = (terminal: Element) =>
  terminal.getAttribute('cNodeName') === 'grounded';

/** The cells an item takes up, relative to its position. */
function footprint(element: Element): { offset: Point; size: Point } {
  if (element.tagName !== 'PowerTransformer') {
    return { offset: [0, 0], size: [1, 1] };
  }
  const rects = obstacleRects(element, [0, 0], 0);
  const [x0, y0] = [0, 1].map(axis =>
    Math.floor(Math.min(...rects.map(rect => rect[axis]))),
  );
  const [x1, y1] = [0, 1].map(axis =>
    Math.ceil(Math.max(...rects.map(rect => rect[axis] + rect[axis + 2]))),
  );
  return { offset: [x0, y0], size: [x1 - x0, y1 - y0] };
}

/** A bay holding nothing but connectivity nodes is drawn as a bus bar. */
const isBusBay = (bay: Element) =>
  !bay.querySelector('ConductingEquipment, PowerTransformer') &&
  childrenOf(bay, 'ConnectivityNode').some(
    node => node.getAttribute('name') !== 'grounded',
  );

type Placement = {
  positions: Map<Element, Point>;
  rects: Map<Element, Rect>;
  busLines: Map<Element, [Point, Point]>;
};

/**
 * Rows of items, each one connection further away from where the bay is fed;
 * an item goes into the column of the item it is reached from, or the next
 * free one.
 */
function arrangeBay(bay: Element, items: Element[]): Element[][] {
  const nodeOf = (terminal: Element) => terminal.getAttribute('connectivityNode');
  const itemsAt = new Map<string, Element[]>();
  items.forEach(item =>
    terminalsOf(item)
      .filter(terminal => !isGrounded(terminal))
      .forEach((terminal) => {
        const node = nodeOf(terminal) ?? '';
        itemsAt.set(node, [...(itemsAt.get(node) ?? []), item]);
      }),
  );
  const doc = bay.ownerDocument;
  const outside = (node: string) =>
    Array.from(doc.querySelectorAll('Terminal, NeutralPoint')).some(
      other =>
        other.getAttribute('connectivityNode') === node &&
        !items.some(own => own.contains(other)),
    );
  const busNodes = new Set(
    Array.from(doc.querySelectorAll('Bay'))
      .filter(isBusBay)
      .flatMap(busBay => childrenOf(busBay, 'ConnectivityNode'))
      .map(node => node.getAttribute('pathName')),
  );
  // A bay is fed from its bus bars, or else from wherever else it connects to.
  const fedBy = (test: (node: string) => boolean) => (item: Element) =>
    terminalsOf(item).some((terminal) => {
      const node = nodeOf(terminal);
      return !!node && !isGrounded(terminal) && test(node) && outside(node);
    });
  const neighbours = (item: Element) =>
    terminalsOf(item).flatMap(terminal =>
      (itemsAt.get(nodeOf(terminal) ?? '') ?? []).filter(other => other !== item),
    );

  const rows: Element[][] = [];
  const columns = new Map<Element, number>();
  const seen = new Set<Element>();
  const start = (sources: Element[]) => {
    let level = sources.filter(item => !seen.has(item));
    level.forEach(item => seen.add(item));
    const parents = new Map<Element, Element>();
    while (level.length) {
      const taken = new Set<number>();
      const row: Element[] = [];
      level
        .map(item => ({ item, wanted: columns.get(parents.get(item)!) ?? 0 }))
        .sort((a, b) => a.wanted - b.wanted)
        .forEach(({ item, wanted }) => {
          let column = wanted;
          while (taken.has(column)) {
            column += 1;
          }
          taken.add(column);
          columns.set(item, column);
          row[column] = item;
        });
      rows.push(row);
      const next: Element[] = [];
      level.forEach(item =>
        neighbours(item).forEach((other) => {
          if (!seen.has(other)) {
            seen.add(other);
            parents.set(other, item);
            next.push(other);
          }
        }),
      );
      level = next;
    }
  };
  const fromBus = items.filter(fedBy(node => busNodes.has(node)));
  const entries = fromBus.length ? fromBus : items.filter(fedBy(() => true));
  start(entries.length ? entries : items.slice(0, 1));
  items.forEach(item => start([item]));
  return rows;
}

/** Sizes of the columns and rows of `rows`, with the cells each item takes up. */
function grid(rows: Element[][]): { widths: number[]; heights: number[] } {
  const widths: number[] = [];
  const heights = rows.map(row =>
    Math.max(1, ...row.filter(item => item).map(item => footprint(item).size[1])),
  );
  rows.forEach(row =>
    row.forEach((item, column) => {
      if (item) {
        widths[column] = Math.max(widths[column] ?? 1, footprint(item).size[0]);
      }
    }),
  );
  return { widths: Array.from(widths, width => width ?? 1), heights };
}

const span = (sizes: number[]) =>
  sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, sizes.length - 1);

/** Places the items of `rows` with their top left cell at `[x, y]`. */
function placeGrid(
  rows: Element[][],
  [x, y]: Point,
  positions: Map<Element, Point>,
): Point {
  const { widths, heights } = grid(rows);
  const left = (column: number) =>
    x + widths.slice(0, column).reduce((sum, w) => sum + w + 1, 0);
  let top = y;
  rows.forEach((row, r) => {
    row.forEach((item, column) => {
      if (item) {
        const { offset } = footprint(item);
        positions.set(item, [left(column) - offset[0], top - offset[1]]);
      }
    });
    top += heights[r] + 1;
  });
  return [span(widths), span(heights)];
}

function place(substation: Element): Placement {
  const positions = new Map<Element, Point>();
  const rects = new Map<Element, Rect>();
  const busLines = new Map<Element, [Point, Point]>();
  let bottom = 1;
  let right = 1;

  childrenOf(substation, 'VoltageLevel').forEach((voltageLevel) => {
    const [vx, vy] = [1, bottom];
    const bays = childrenOf(voltageLevel, 'Bay');
    const buses = bays.filter(isBusBay);
    const feeders = bays.filter(bay => !isBusBay(bay));

    // Room for the label, then the bus bars, then room to run feeders to them.
    let y = vy + 2;
    const busRows = buses.map(() => {
      const row = y;
      y += 2;
      return row;
    });
    if (buses.length) {
      y += 1;
    }

    let x = vx + 1;
    let height = 1;
    feeders.forEach((bay) => {
      const items = Array.from(
        bay.querySelectorAll(':scope > ConductingEquipment, :scope > PowerTransformer'),
      );
      const [w, h] = items.length
        ? placeGrid(arrangeBay(bay, items), [x + 1, y + 1], positions)
        : [1, 1];
      rects.set(bay, [x, y, w + 2, h + 2]);
      x += w + 3;
      height = Math.max(height, h + 2);
    });
    childrenOf(voltageLevel, 'PowerTransformer').forEach((transformer) => {
      const { offset, size } = footprint(transformer);
      positions.set(transformer, [x + 1 - offset[0], y + 1 - offset[1]]);
      x += size[0] + 2;
      height = Math.max(height, size[1] + 2);
    });

    const width = Math.max(x - vx, 6);
    buses.forEach((bay, i) => {
      rects.set(bay, [vx + 1, busRows[i], width - 2, 1]);
      const node = childrenOf(bay, 'ConnectivityNode').find(
        n => n.getAttribute('name') !== 'grounded',
      )!;
      busLines.set(node, [
        [vx + 1.5, busRows[i] + 0.5],
        [vx + width - 1.5, busRows[i] + 0.5],
      ]);
    });
    const vh = y + height + 1 - vy;
    rects.set(voltageLevel, [vx, vy, width, vh]);
    bottom = vy + vh + 2;
    right = Math.max(right, vx + width);
  });

  let y = 1;
  childrenOf(substation, 'PowerTransformer').forEach((transformer) => {
    const { offset, size } = footprint(transformer);
    positions.set(transformer, [right + 3 - offset[0], y - offset[1]]);
    y += size[1] + 2;
    right = Math.max(right, right + 3 + size[0]);
  });
  rects.set(substation, [0, 0, right + 3, Math.max(bottom, y) + 2]);
  return { positions, rects, busLines };
}

type Wire = {
  node: Element;
  points: Point[];
  uuids: [string | undefined, string | undefined];
  bus: boolean;
  /** The unit whose group the wire belongs to. */
  unit: number;
};

/** A terminal, or the bus bar of a node, that the wires of the node must reach. */
type Unit =
  | { kind: 'terminal'; node: Element; terminal: Element; port: Port; owner: Element }
  | { kind: 'bus'; node: Element; line: [Point, Point] };

const manhattan = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const nearestOn = ([a, b]: [Point, Point], [x, y]: Point): Point => [
  Math.min(Math.max(x, Math.min(a[0], b[0])), Math.max(a[0], b[0])),
  Math.min(Math.max(y, Math.min(a[1], b[1])), Math.max(a[1], b[1])),
];

const unitPoint = (unit: Unit, towards: Point): Point =>
  unit.kind === 'terminal' ? unit.port.point : nearestOn(unit.line, towards);

const add = ([x, y]: Point, [dx, dy]: Point): Point => [
  x + dx * STEP,
  y + dy * STEP,
];

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

/** Where `point` lies strictly inside the polyline `points`: after which point, and whether on it. */
function cutIndex(
  points: Point[],
  [x, y]: Point,
): { index: number; onVertex: boolean } | undefined {
  const vertex = points.slice(1, -1).findIndex(p => same(p, [x, y]));
  if (vertex >= 0) {
    return { index: vertex + 1, onVertex: true };
  }
  const index = points.slice(1).findIndex(([x2, y2], i) => {
    const [x1, y1] = points[i];
    return (
      (x1 === x2 && x === x1 && (y - y1) * (y - y2) < 0) ||
      (y1 === y2 && y === y1 && (x - x1) * (x - x2) < 0)
    );
  });
  return index >= 0 ? { index, onVertex: false } : undefined;
}

/** Cuts wires wherever another wire of their node ends inside them. */
function splitAtJunctions(wires: Wire[]): Wire[] {
  const result = [...wires];
  const split = () => {
    for (const wire of result) {
      for (const end of [wire.points[0], wire.points[wire.points.length - 1]]) {
        const target = result.find(
          other =>
            other !== wire &&
            other.node === wire.node &&
            cutIndex(other.points, end) !== undefined,
        );
        if (target) {
          const { index, onVertex } = cutIndex(target.points, end)!;
          result.splice(
            result.indexOf(target),
            1,
            {
              ...target,
              points: [...target.points.slice(0, index + 1), ...(onVertex ? [] : [end])],
              uuids: [target.uuids[0], undefined],
            },
            {
              ...target,
              points: [end, ...target.points.slice(index + 1)],
              uuids: [undefined, target.uuids[1]],
            },
          );
          return true;
        }
      }
    }
    return false;
  };
  while (split()) {
    // Cut until no wire ends inside another.
  }
  return result;
}

/** The half-grid points on `wires` nearest to `towards` first, apart from where they meet terminals. */
function nearestWirePoint(wires: Wire[], towards: Point): Point | undefined {
  const candidates = wires.flatMap((wire) => {
    const attached = wire.points.filter(
      (_, k) =>
        (k === 0 && wire.uuids[0]) ||
        (k === wire.points.length - 1 && wire.uuids[1]),
    );
    return wire.points.slice(1).flatMap(([x2, y2], i): Point[] => {
      const [x1, y1] = wire.points[i];
      const steps = Math.round(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / STEP);
      return Array.from({ length: steps + 1 }, (_, s): Point => {
        const t = steps ? s / steps : 0;
        return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
      }).filter(
        point =>
          point.every(c => Number.isInteger(c / STEP)) &&
          !attached.some(a => same(a, point)),
      );
    });
  });
  return candidates.sort(
    (p, q) => manhattan(p, towards) - manhattan(q, towards),
  )[0];
}

/**
 * The wires that connect every terminal of every connectivity node in the
 * substation, and the uuids they refer to the terminals by.
 */
function route(
  substation: Element,
  placement: Placement,
): { wires: Wire[]; uuids: Map<Element, string> } {
  const { positions, rects, busLines } = placement;
  const [, , width, height] = rects.get(substation)!;
  const owners = Array.from(
    substation.querySelectorAll('ConductingEquipment, PowerTransformer'),
  ).filter(owner => positions.has(owner));
  const ownRects = (owner: Element) =>
    obstacleRects(owner, positions.get(owner), 0);
  const obstacles = owners.flatMap(ownRects);

  const nodes = Array.from(substation.querySelectorAll('ConnectivityNode')).filter(
    node => node.getAttribute('name') !== 'grounded',
  );
  const units: Unit[] = [];
  nodes.forEach((node) => {
    const line = busLines.get(node);
    if (line) {
      units.push({ kind: 'bus', node, line });
    }
    const pathName = node.getAttribute('pathName');
    owners.forEach(owner =>
      terminalsOf(owner)
        .filter(terminal => terminal.getAttribute('connectivityNode') === pathName)
        .forEach((terminal) => {
          const port = terminalPortAt(terminal, positions);
          if (port) {
            units.push({ kind: 'terminal', node, terminal, port, owner });
          }
        }),
    );
  });

  const parent = units.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      i = parent[i];
    }
    return i;
  };

  // The shortest connections that tie together each node, shortest first overall.
  const edges = nodes.flatMap((node) => {
    const own = units
      .map((unit, i) => ({ unit, i }))
      .filter(({ unit }) => unit.node === node);
    // Everything on a bus bar is connected to the bus bar itself.
    const bus = own.find(({ unit }) => unit.kind === 'bus');
    if (bus) {
      return own
        .filter(other => other !== bus)
        .map(({ unit, i }) => ({
          a: i,
          b: bus.i,
          length: manhattan(unitPoint(unit, [0, 0]), unitPoint(bus.unit, unitPoint(unit, [0, 0]))),
        }));
    }
    const pairs = own
      .flatMap((a, j) =>
        own.slice(j + 1).map((b) => {
          const from = unitPoint(a.unit, unitPoint(b.unit, [0, 0]));
          return {
            a: a.i,
            b: b.i,
            length: manhattan(from, unitPoint(b.unit, from)),
          };
        }),
      )
      .sort((p, q) => p.length - q.length);
    const tree = new Map(own.map(({ i }) => [i, i]));
    const root = (i: number): number => {
      while (tree.get(i) !== i) {
        i = tree.get(i)!;
      }
      return i;
    };
    return pairs.filter(({ a, b }) => {
      const [ra, rb] = [root(a), root(b)];
      tree.set(ra, rb);
      return ra !== rb;
    });
  });
  edges.sort((p, q) => p.length - q.length);

  const wires: Wire[] = units.flatMap((unit, i): Wire[] =>
    unit.kind === 'bus'
      ? [{ node: unit.node, points: [...unit.line], uuids: [undefined, undefined], bus: true, unit: i }]
      : [],
  );
  const uuids = new Map<Element, string>();
  const uuidOf = (terminal: Element) => {
    const id = getSLDAttributes(terminal, 'uuid') ?? uuids.get(terminal) ?? uuid();
    uuids.set(terminal, id);
    return id;
  };
  const groupWires = (i: number) =>
    wires.filter(wire => find(wire.unit) === find(i));

  const routerFor = (mode: RouterMode) =>
    new ConnectionRouter(
      width,
      height,
      obstacles,
      wires.map(wire => ({
        net: find(wire.unit),
        points: wire.points,
        bus: wire.bus,
        terminals: wire.points.filter(
          (_, k) =>
            (k === 0 && wire.uuids[0]) ||
            (k === wire.points.length - 1 && wire.uuids[1]),
        ),
      })),
      mode,
    );

  edges.forEach(({ a, b }) => {
    if (find(a) === find(b)) {
      return;
    }
    const loose = (i: number) =>
      units[i].kind === 'terminal' && !groupWires(i).length;
    const [source, target] = loose(a) || !loose(b) ? [a, b] : [b, a];
    const from = units[source];
    const to = units[target];
    const towards = unitPoint(to, unitPoint(from, [0, 0]));

    // A wire starts in front of a terminal, or else on a wire of its group.
    let start: Point[] = [];
    let origin: Point;
    let heading: Point = [0, 0];
    if (from.kind === 'terminal' && loose(source)) {
      const { point, approach, outward } = from.port;
      origin =
        from.owner.tagName === 'PowerTransformer'
          ? leaveRects(approach, outward, ownRects(from.owner))
          : approach;
      start = [point];
      heading = outward;
    } else {
      origin = nearestWirePoint(groupWires(source), towards) ?? towards;
    }

    const toTerminal = to.kind === 'terminal' && loose(target);
    let stub: Point | undefined;
    if (to.kind === 'terminal' && toTerminal) {
      const { approach, outward } = to.port;
      stub =
        to.owner.tagName === 'PowerTransformer'
          ? leaveRects(add(approach, outward), outward, ownRects(to.owner))
          : add(approach, outward);
    }
    let found: Point[] | undefined;
    for (const mode of ['strict', 'tight', 'soft'] as RouterMode[]) {
      const router = routerFor(mode);
      found = stub
        ? router.route(origin, heading, stub)
        : router.routeToNet(
          origin,
          heading,
          find(target),
          [],
          to.kind === 'bus' ? nearestOn(to.line, origin) : undefined,
        );
      if (found) {
        break;
      }
    }
    const end: Point[] =
      to.kind === 'terminal' && toTerminal ? [to.port.approach, to.port.point] : [];
    const points: Point[] = found
      ? [...start, ...found, ...end]
      : [...start, origin, [towards[0], origin[1]], towards, ...end];
    cleanPath(points);

    wires.push({
      node: from.node,
      points,
      uuids: [
        from.kind === 'terminal' && start.length ? uuidOf(from.terminal) : undefined,
        to.kind === 'terminal' && toTerminal ? uuidOf(to.terminal) : undefined,
      ],
      bus: false,
      unit: source,
    });
    parent[find(source)] = find(target);
  });

  return { wires: splitAtJunctions(wires), uuids };
}

/**
 * Edits that give every voltage level, bay, piece of equipment and
 * transformer of `substation` a place, and draw all of its connections.
 */
export function autoLayoutEdits(substation: Element, nsp: string): EditV2[] {
  const placement = place(substation);
  const { positions, rects } = placement;
  const doc = substation.ownerDocument;
  const edits: EditV2[] = [];

  rects.forEach(([x, y, w, h], element) => {
    edits.push(
      updateSLDAttributes(
        element,
        nsp,
        element === substation
          ? { w: `${w}`, h: `${h}` }
          : { x: `${x}`, y: `${y}`, w: `${w}`, h: `${h}`, lx: `${x}`, ly: `${y}` },
      ),
    );
  });
  positions.forEach(([x, y], element) => {
    const [lx, ly] =
      element.tagName === 'PowerTransformer' ? [x + 1.5, y] : [x + 1, y + 1];
    edits.push(
      updateSLDAttributes(element, nsp, {
        x: `${x}`,
        y: `${y}`,
        lx: `${lx}`,
        ly: `${ly}`,
      }),
    );
  });

  const { wires, uuids } = route(substation, placement);
  uuids.forEach((id, terminal) => {
    if (getSLDAttributes(terminal, 'uuid') !== id) {
      edits.push(updateSLDAttributes(terminal, nsp, { uuid: id }));
    }
  });

  const byNode = new Map<Element, Wire[]>();
  wires.forEach(wire =>
    byNode.set(wire.node, [...(byNode.get(wire.node) ?? []), wire]),
  );
  byNode.forEach((nodeWires, node) => {
    const existing = Array.from(node.children).find(
      child => child.tagName === 'Private' && child.getAttribute('type') === privType,
    );
    const priv =
      existing ?? doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
    priv.setAttribute('type', privType);
    nodeWires.forEach((wire) => {
      const section = doc.createElementNS(sldNs, `${nsp}:Section`);
      if (wire.bus) {
        setSLDAttributes(section, nsp, { bus: 'true' });
      }
      wire.points.forEach(([x, y], i) => {
        const vertex = doc.createElementNS(sldNs, `${nsp}:Vertex`);
        setSLDAttributes(vertex, nsp, { x: `${x}`, y: `${y}` });
        const id =
          i === 0 ? wire.uuids[0] : i === wire.points.length - 1 ? wire.uuids[1] : undefined;
        if (id) {
          setSLDAttributes(vertex, nsp, { uuid: id });
        }
        section.appendChild(vertex);
      });
      if (existing) {
        edits.push({ parent: priv, node: section, reference: null });
      } else {
        priv.appendChild(section);
      }
    });
    if (!existing) {
      edits.push({ parent: node, node: priv, reference: getReference(node, 'Private') });
    }
  });

  return edits;
}
