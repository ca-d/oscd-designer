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
import type { EditV2 } from '@openscd/oscd-api';
import type { Point } from './geometry.js';
/**
 * What the user is changing: moving an element (and all it contains), turning
 * equipment a quarter, mirroring a transformer, routing a wire through a point
 * running a bus bar (the `element`) along a new line from `start` to `end`, or
 * moving a junction of the connectivity node `element` from `from` to `to`.
 */
export type LayoutChange = {
    kind: 'move';
    element: Element;
    dx: number;
    dy: number;
} | {
    kind: 'rotate';
    element: Element;
} | {
    kind: 'flip';
    element: Element;
} | {
    kind: 'section';
    element: Element;
    via: Point;
} | {
    kind: 'bus';
    element: Element;
    start: Point;
    end: Point;
} | {
    kind: 'junction';
    element: Element;
    from: Point;
    to: Point;
};
/** Where a section meets its end: the point, the first point of a route there and the direction leaving it. */
export type Port = {
    point: Point;
    approach: Point;
    outward: Point;
};
export type End = {
    vertex: Element;
    port?: Port;
    terminal?: Element;
    /** The terminal's vertex is not where its terminal now is. */
    detached: boolean;
    /** Neither at a terminal nor joined to another wire. */
    free: boolean;
};
/** Where a transformer terminal would be once its transformer is mirrored. */
export declare function flippedTerminalPort(terminal: Element): Port | undefined;
/** How the ends of `section` are held; a free end is held by nothing. */
export declare function sectionEnds(section: Element): [End, End] | undefined;
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
export declare function pointsSignature(points: Point[]): string;
export declare function sectionSignature(section: Element): string;
/** A section that runs through other elements, with the geometry it has. */
export type FlaggedSection = Pick<PlannedRoute, 'section' | 'points'>;
/** Sections not in `skip` that `change` leaves running through equipment, one of them having moved. */
export declare function overlappedSections(doc: XMLDocument, change: LayoutChange, skip: Set<Element>): FlaggedSection[];
/**
 * Where the sections left off their terminals by `change` would run
 * afterwards. Nothing is changed in the document.
 */
export declare function planReroutes(doc: XMLDocument, change: LayoutChange): PlannedRoute[];
/**
 * Edits that keep every connection attached after `change`, rerouting the
 * sections whose terminals are no longer where their wires end. Sections that
 * had to run through other elements, or that the change leaves running through
 * equipment, are added to `fallbacks`.
 */
export declare function rerouteEdits(doc: XMLDocument, change: LayoutChange, nsp: string, fallbacks?: FlaggedSection[]): EditV2[];
/** Edits that give the sections of `routes` their planned geometry; the fallbacks among them are added to `fallbacks`. */
export declare function routeEdits(doc: XMLDocument, routes: PlannedRoute[], nsp: string, fallbacks?: FlaggedSection[]): EditV2[];
