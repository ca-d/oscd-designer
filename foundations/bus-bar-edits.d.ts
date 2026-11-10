/**
 * Sizing a bus bar without disconnecting what is attached to it.
 *
 * A bus bar is a straight run of thick sections along the middle of its bay,
 * cut wherever a feeder joins. Running it along another line leaves the
 * feeders that no longer meet it (or that would now run along it) to be routed
 * to it anew, each joining where it can arrive straight on and spread out
 * along its length.
 */
import type { EditV2 } from '@openscd/oscd-api';
import type { FlaggedSection, PlannedRoute } from './rerouting.js';
import type { Point, Rect } from './geometry.js';
/** The ends of the line through the middle of the cells of a bus bar. */
export declare const busBarLine: ([x, y, w, h]: Rect) => [Point, Point];
/**
 * The cells a bus bar covers after the end `handle` of it is dragged to the
 * cell `cursor`: the other end stays and the bus bar keeps to the voltage level
 * around it. `BR` is the bottom or right end, `TL` the top or left one.
 */
export declare function resizedBusBarRect(bay: Element, handle: 'BR' | 'TL', [cursorX, cursorY]: Point): Rect;
/** The cells of a new bus bar dragged out from the cell `anchor` to the cell `cursor`. */
export declare function draggedBusBarRect([anchorX, anchorY]: Point, [cursorX, cursorY]: Point): Rect;
/** The places inside the line `[start, end]` of the bus bar `bay` where the sections of its net join it once `routes` are applied. */
export declare function busBarJunctions(bay: Element, routes: Pick<PlannedRoute, 'section' | 'points' | 'ends'>[], [start, end]: [Point, Point]): Point[];
/**
 * Edits that size the bus bar `bay` to the cells `rect`, keeping every feeder
 * connected. Feeders that had to be drawn through other elements are added to
 * `fallbacks`.
 */
export declare function busBarResizeEdits(doc: XMLDocument, bay: Element, rect: Rect, nsp: string, fallbacks?: FlaggedSection[]): EditV2[];
/** Edits that run a freshly made bus bar along the line through the cells `rect`. */
export declare function busBarLineEdits(bay: Element, rect: Rect, nsp: string): EditV2[];
