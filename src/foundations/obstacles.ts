import { attributes } from './sld-attributes.js';
import { transformerWindingMeasures } from './transformer.js';

import type { Point, Rect } from './geometry.js';

/** Half the width (grid units) of the area a winding blocks around its centre; the half-grid point outside its circle lies just beyond. */
const WINDING_HALF_SIZE = 0.9;

const STEP = 0.5;
const EPSILON = 1e-6;

/** Where a connection leaves a terminal: the terminal, the half-grid point just outside it and the direction outwards. */
export type TerminalPort = { point: Point; approach: Point; outward: Point };

/** The port of a winding's `terminal`, leaving straight away from the winding's `center`. */
export function windingPort(center: Point, terminal: Point): TerminalPort {
  const [dx, dy] = [terminal[0] - center[0], terminal[1] - center[1]];
  const outward: Point =
    Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  const axis = outward[0] !== 0 ? 0 : 1;
  const scaled = terminal[axis] / STEP;
  const approach: Point = [...terminal];
  approach[axis] =
    (outward[axis] > 0 ? Math.ceil(scaled - EPSILON) : Math.floor(scaled + EPSILON)) *
    STEP;
  if (Math.abs(approach[axis] - terminal[axis]) < EPSILON) {
    approach[axis] += outward[axis] * STEP;
  }
  return { point: terminal, approach, outward };
}

/**
 * The first half-grid point at or beyond `from`, going `outward`, that lies
 * outside all of `rects` (borders included).
 */
export function leaveRects(from: Point, outward: Point, rects: Rect[]): Point {
  const inside = ([px, py]: Point) =>
    rects.some(
      ([x, y, w, h]) =>
        px >= x - EPSILON &&
        px <= x + w + EPSILON &&
        py >= y - EPSILON &&
        py <= y + h + EPSILON,
    );
  const point: Point = [...from];
  for (let steps = 0; steps < 16 && inside(point); steps += 1) {
    point[0] += outward[0] * STEP;
    point[1] += outward[1] * STEP;
  }
  return point;
}

/**
 * The areas wires keep out of for `element`, as if it stood at `at` and was
 * turned `rot` quarters. A winding of a transformer is larger than its square,
 * so it blocks a square of 1.8 around the centre of its circle.
 */
export function obstacleRects(
  element: Element,
  at?: Point,
  rot?: 0 | 1 | 2 | 3,
): Rect[] {
  const attrs = attributes(element);
  const [x, y] = at ?? attrs.pos;
  const windings =
    element.localName === 'PowerTransformer'
      ? Array.from(element.children).filter(
        child => child.tagName === 'TransformerWinding',
      )
      : [];
  if (!windings.length) {
    return [[x, y, attrs.dim[0], attrs.dim[1]]];
  }

  return windings.map((winding) => {
    const {
      center: [cx, cy],
    } = transformerWindingMeasures(
      winding,
      [x, y],
      { rot: rot ?? attrs.rot, kind: attrs.kind, flip: attrs.flip },
      '',
    );
    return [
      cx - WINDING_HALF_SIZE,
      cy - WINDING_HALF_SIZE,
      2 * WINDING_HALF_SIZE,
      2 * WINDING_HALF_SIZE,
    ];
  });
}
