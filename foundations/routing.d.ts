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
import type { Point, Rect } from './geometry.js';
/**
 * How a router treats what is in its way. A `strict` router stays clear of
 * equipment altogether, borders included, so every route leaves a terminal
 * straight for half a grid step. A `tight` router also lets routes turn on an
 * equipment border, which gets them out of cramped spots, but prefers not to. A
 * `soft` router goes through anything, at a price.
 */
export type RouterMode = 'strict' | 'tight' | 'soft';
/**
 * An existing orthogonal polyline belonging to the net `net`. Its `terminals`
 * are the points where it is attached to equipment, which cannot be connected
 * to. A `bus` is thicker than a wire and is met straight on at its ends.
 */
export type Wire = {
    net: unknown;
    points: Point[];
    terminals?: Point[];
    bus?: boolean;
};
export declare class ConnectionRouter {
    private readonly cols;
    private readonly rows;
    private readonly cells;
    private readonly graph;
    private readonly netGoals;
    private readonly reserved;
    /** Extra cost of reaching a node, by node. */
    private readonly penalty?;
    /**
     * @param width - routing area width in grid units
     * @param height - routing area height in grid units
     * @param obstacles - rectangles routes may not enter or touch
     * @param wires - existing wires that routes must not overlap or touch
     * @param mode - how strictly to keep clear of what is in the way
     */
    constructor(width: number, height: number, obstacles: Rect[], wires?: Wire[], mode?: RouterMode);
    private id;
    private cell;
    private hasState;
    /** Calls `visit` for each node strictly inside the orthogonal segment. */
    private interior;
    private markWires;
    private stepCost;
    private buildGraph;
    /** Positions along the committed legs of the route being drawn. */
    private occupied;
    /**
     * Keeps all later routes off the given polyline, crossings included.
     * @returns a function that lifts the reservation again
     */
    reserve(points: Point[]): () => void;
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
    route(from: Point, heading: Point, to: Point, own?: Point[]): Point[] | undefined;
    /**
     * Routes to the nearest place where the connection can meet the wires of
     * `net` (never along them) and ends there. Which point on the net that is
     * depends only on the route, so it is the same wherever on the net the user
     * pointed. The exceptions are pointing at one of its bends or free ends
     * (`at`), and at a bus bar, which are met there when they can be reached.
     */
    routeToNet(from: Point, heading: Point, net: unknown, own?: Point[], at?: Point): Point[] | undefined;
    /** Routes to the bus bar of `net` at `at`, arriving straight on, or returns `undefined`. */
    private routeToBus;
    /**
     * Routes to a bend or free end of `net` and ends exactly there (free ends
     * straight on), or returns `undefined`.
     */
    routeToVertex(from: Point, heading: Point, net: unknown, at: Point, own?: Point[]): Point[] | undefined;
    private plan;
    private search;
}
/**
 * The direction in which a connection path is currently travelling at its last
 * committed point (its second-to-last point). The final point is provisional
 * and only reveals that direction; as in {@link elbowCorner}, a segment is
 * vertical when both of its points share an x.
 */
export declare function connectHeading(path: Point[]): Point;
/**
 * The point half a grid step in front of a snap target's terminal edge (`far`),
 * on the side facing away from the equipment (`near` is the terminal end, which
 * lies inside it). A route ends here, then runs from `far` to `near`.
 */
export declare function snapApproachPoint(snap: {
    near: Point;
    far: Point;
}): Point;
/**
 * Completes a connection path with a route (followed by optional `tail`
 * points) replacing the provisional last point.
 */
export declare function finishRoute(path: Point[], route: Point[], ...tail: Point[]): Point[];
/**
 * Commits a route into a connection that carries on: the route's end becomes
 * the new anchor, and a provisional point just ahead of it keeps the direction
 * of travel for the next route.
 */
export declare function extendRoute(path: Point[], route: Point[]): Point[];
