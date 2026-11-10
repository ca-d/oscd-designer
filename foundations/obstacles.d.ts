import type { Point, Rect } from './geometry.js';
/** Where a connection leaves a terminal: the terminal, the half-grid point just outside it and the direction outwards. */
export type TerminalPort = {
    point: Point;
    approach: Point;
    outward: Point;
};
/** The port of a winding's `terminal`, leaving straight away from the winding's `center`. */
export declare function windingPort(center: Point, terminal: Point): TerminalPort;
/**
 * The first half-grid point at or beyond `from`, going `outward`, that lies
 * outside all of `rects` (borders included).
 */
export declare function leaveRects(from: Point, outward: Point, rects: Rect[]): Point;
/**
 * The areas wires keep out of for `element`, as if it stood at `at` and was
 * turned `rot` quarters. A winding of a transformer is larger than its square,
 * so it blocks a square of 1.8 around the centre of its circle.
 */
export declare function obstacleRects(element: Element, at?: Point, rot?: 0 | 1 | 2 | 3): Rect[];
