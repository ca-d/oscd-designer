/**
 * Sizing a bus bar without disconnecting what is attached to it.
 *
 * A bus bar is a straight run of thick sections along the middle of its bay,
 * cut wherever a feeder joins. Running it along another line leaves the
 * feeders that no longer meet it (or that would now run along it) to be routed
 * to it anew, each joining where it can arrive straight on and spread out
 * along its length.
 */

import { sldNs } from '../foundations.js';
import { busSections } from './connectivity.js';
import { createResizeEdits, createResizeTLEdits } from './edits.js';
import { planReroutes, routeEdits } from './rerouting.js';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import {
  attributes,
  getSLDAttributes,
  setSLDAttributes,
  xmlBoolean,
} from './sld-attributes.js';

import type { EditV2 } from '@openscd/oscd-api';
import type { FlaggedSection, PlannedRoute } from './rerouting.js';
import type { Point, Rect } from './geometry.js';

const EPSILON = 1e-9;

/** The ends of the line through the middle of the cells of a bus bar. */
export const busBarLine = ([x, y, w, h]: Rect): [Point, Point] => [
  [x + 0.5, y + 0.5],
  [x + w - 0.5, y + h - 0.5],
];

/** The cells of a bus bar running the longer of the two distances, at least two cells long, within the room it has. */
function runFor(
  dx: number,
  dy: number,
  roomX: number,
  roomY: number,
): [number, number] {
  const clamp = (n: number, room: number) => Math.max(1, Math.min(n, room));
  const [w, h] =
    dx > dy ? [clamp(dx + 1, roomX), 1] : [1, clamp(dy + 1, roomY)];
  if (w * h > 1) {
    return [w, h];
  }
  return roomX >= 2 ? [2, 1] : [1, 2];
}

/**
 * The cells a bus bar covers after the end `handle` of it is dragged to the
 * cell `cursor`: the other end stays and the bus bar keeps to the voltage level
 * around it. `BR` is the bottom or right end, `TL` the top or left one.
 */
export function resizedBusBarRect(
  bay: Element,
  handle: 'BR' | 'TL',
  [cursorX, cursorY]: Point,
): Rect {
  const {
    pos: [x, y],
    dim: [w, h],
  } = attributes(bay);
  const parent = bay.parentElement;
  const [left, top, width, height] =
    parent?.tagName === 'VoltageLevel'
      ? [...attributes(parent).pos, ...attributes(parent).dim]
      : [0, 0, Infinity, Infinity];

  if (handle === 'BR') {
    const [newW, newH] = runFor(
      Math.max(cursorX - x, 0),
      Math.max(cursorY - y, 0),
      left + width - x,
      top + height - y,
    );
    return [x, y, newW, newH];
  }

  const [lastX, lastY] = [x + w - 1, y + h - 1];
  const [newW, newH] = runFor(
    Math.max(lastX - cursorX, 0),
    Math.max(lastY - cursorY, 0),
    lastX - left + 1,
    lastY - top + 1,
  );
  return [lastX - newW + 1, lastY - newH + 1, newW, newH];
}

/** The cells of a new bus bar dragged out from the cell `anchor` to the cell `cursor`. */
export function draggedBusBarRect(
  [anchorX, anchorY]: Point,
  [cursorX, cursorY]: Point,
): Rect {
  const [dx, dy] = [Math.abs(cursorX - anchorX), Math.abs(cursorY - anchorY)];
  if (dx >= dy) {
    return [Math.min(anchorX, cursorX), anchorY, Math.max(dx + 1, 2), 1];
  }
  return [anchorX, Math.min(anchorY, cursorY), 1, dy + 1];
}

function newBusSection(doc: Document, nsp: string, from: Point, to: Point) {
  const section = doc.createElementNS(sldNs, `${nsp}:Section`);
  setSLDAttributes(section, nsp, { bus: 'true' });
  [from, to].forEach(([x, y]) => {
    const vertex = doc.createElementNS(sldNs, `${nsp}:Vertex`);
    setSLDAttributes(vertex, nsp, { x: x.toString(), y: y.toString() });
    section.appendChild(vertex);
  });
  return section;
}

/** The places inside the line `[start, end]` of the bus bar `bay` where the sections of its net join it once `routes` are applied. */
export function busBarJunctions(
  bay: Element,
  routes: Pick<PlannedRoute, 'section' | 'points' | 'ends'>[],
  [start, end]: [Point, Point],
): Point[] {
  const axis = start[1] === end[1] ? 0 : 1;
  const planned = new Set(routes.map(route => route.section));
  const net = busSections(bay)[0]?.closest('ConnectivityNode');
  const joins = [
    ...routes.map(({ ends, points }) =>
      ends[0].detached ? points[0] : points[points.length - 1],
    ),
    ...Array.from(net?.getElementsByTagNameNS(sldNs, 'Section') ?? [])
      .filter(
        section =>
          !xmlBoolean(getSLDAttributes(section, 'bus')) &&
          !planned.has(section),
      )
      .flatMap(section =>
        Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(
          vertex => attributes(vertex).pos,
        ),
      ),
  ].filter(
    point =>
      Math.abs(point[1 - axis] - start[1 - axis]) < EPSILON &&
      point[axis] > start[axis] + EPSILON &&
      point[axis] < end[axis] - EPSILON,
  );
  const seen = new Set<number>();
  return joins
    .filter(point => !seen.has(point[axis]) && seen.add(point[axis]))
    .sort((a, b) => a[axis] - b[axis]);
}

/**
 * Edits that size the bus bar `bay` to the cells `rect`, keeping every feeder
 * connected. Feeders that had to be drawn through other elements are added to
 * `fallbacks`.
 */
export function busBarResizeEdits(
  doc: XMLDocument,
  bay: Element,
  rect: Rect,
  nsp: string,
  fallbacks: FlaggedSection[] = [],
): EditV2[] {
  const buses = busSections(bay);
  if (!buses.length) {
    return [];
  }
  const [x, y, w, h] = rect;
  const [start, end] = busBarLine(rect);
  const axis = start[1] === end[1] ? 0 : 1;
  const pointAt = (t: number): Point =>
    axis === 0 ? [t, start[1]] : [start[0], t];

  const routes = planReroutes(doc, { kind: 'bus', element: bay, start, end });
  const stops = [
    start[axis],
    ...busBarJunctions(bay, routes, [start, end]).map(point => point[axis]),
    end[axis],
  ];

  const priv = buses[0].parentElement!;
  const { pos } = attributes(bay);
  return [
    pos[0] !== x || pos[1] !== y
      ? createResizeTLEdits(bay, nsp, x, y, w, h)
      : createResizeEdits(bay, nsp, w, h),
    ...routeEdits(doc, routes, nsp, fallbacks),
    ...stops.slice(1).map(
      (stop, i): EditV2 => ({
        parent: priv,
        node: newBusSection(doc, nsp, pointAt(stops[i]), pointAt(stop)),
        reference: priv.firstElementChild,
      }),
    ),
    ...buses.map((section): EditV2 => ({ node: section })),
  ];
}

/** Edits that run a freshly made bus bar along the line through the cells `rect`. */
export function busBarLineEdits(
  bay: Element,
  rect: Rect,
  nsp: string,
): EditV2[] {
  const [section] = busSections(bay);
  const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
  return busBarLine(rect).map(([x, y], i) =>
    updateSLDAttributes(vertices[i === 0 ? 0 : vertices.length - 1], nsp, {
      x: x.toString(),
      y: y.toString(),
    }),
  );
}
