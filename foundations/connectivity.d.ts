import type { Point } from './geometry.js';
import type { Terminal } from './interaction-mode.js';
/** Returns the SLD sections in an element that are marked as busbar geometry. */
export declare function busSections(element: Element): Element[];
/** Checks whether a Bay element is represented as an SLD busbar. */
export declare function isBusBar(element: Element): boolean;
/** Creates the template Bay structure used by the palette for new busbars. */
export declare function makeBusBar(doc: XMLDocument, nsp: string): Element;
/** Builds the slash-separated SCL connectivity path for an element and optional child path parts. */
export declare function connectivityPath(element: Element, ...rest: string[]): string;
/** Calculates rendered anchor points for starting T1 and T2 connections from equipment. */
export declare function connectionStartPoints(equipment: Element): {
    T1: [Point, Point];
    T2: [Point, Point];
};
/**
 * Anchor points of T1 and T2 for equipment at `pos` turned by `rot`: the
 * terminal end of a connection and the point where it meets the equipment's
 * edge.
 */
export declare function connectionPointsAt([x, y]: Point, rot: 0 | 1 | 2 | 3): {
    T1: [Point, Point];
    T2: [Point, Point];
};
/** The element and terminal a connection being drawn would end on, with its wire approach points. */
export type ConnectTarget = {
    to: Element;
    toTerminal: Terminal;
    near: Point;
    far: Point;
};
/** Windings may not connect directly to each other; a line equipment in between models that within a Bay. */
export declare function canConnectToWinding(from: Element): boolean;
