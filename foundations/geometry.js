/**
 * Pure rectangle and point math.
 *
 * All functions here operate on numeric tuples (Rect, Point) with no
 * knowledge of DOM Elements or SCL structure.
 */
export function contains([x1, y1, w1, h1], [x2, y2, w2, h2]) {
    return x1 <= x2 && y1 <= y2 && x1 + w1 >= x2 + w2 && y1 + h1 >= y2 + h2;
}
export function overlaps([x1, y1, w1, h1], [x2, y2, w2, h2]) {
    if (x1 >= x2 + w2 || x2 >= x1 + w1) {
        return false;
    }
    if (y1 >= y2 + h2 || y2 >= y1 + h1) {
        return false;
    }
    return true;
}
function between(a, x, b) {
    return (a <= x && x <= b) || (b <= x && x <= a);
}
function liesOn([x, y], [x1, y1], [x2, y2]) {
    return ((x === x1 && x === x2 && between(y1, y, y2)) ||
        (y === y1 && y === y2 && between(x1, x, x2)));
}
function pointsOnLine(p1, p2) {
    const points = [];
    const coord = p1[0] === p2[0] ? 1 : 0;
    let p = p1[coord] < p2[coord] ? p1 : p2;
    const q = p === p1 ? p2 : p1;
    p = p.slice();
    p[coord] = Math.floor(p[coord] * 2) / 2;
    while (p[coord] <= q[coord]) {
        points.push(p);
        p = p.slice();
        p[coord] += 0.5;
    }
    return points;
}
export function distance([x1, y1], [x2, y2]) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}
function closestPointOnLine(p, p1, p2) {
    let point = p1;
    const points = pointsOnLine(p1, p2);
    points.forEach((candidate) => {
        if (distance(candidate, p) < distance(point, p)) {
            point = candidate;
        }
    });
    return point;
}
export function findIntersection(p1, p2, lp1, lp2) {
    if (liesOn(p1, lp1, lp2)) {
        return p1;
    }
    if (liesOn(lp1, p1, p2)) {
        return lp1;
    }
    if (liesOn(lp2, p1, p2)) {
        return lp2;
    }
    return closestPointOnLine(p2, lp1, lp2);
}
/**
 * Extend a connection path with a newly committed waypoint while the user is
 * drawing a connection.
 *
 * A connection path is the list of orthogonal waypoints running from the source
 * terminal to the cursor. Its *final* point is provisional: it tracks the live
 * cursor so the in-progress segment can be previewed as the user moves the
 * mouse. Committing a waypoint is therefore not a plain append — the provisional
 * last point must first be **replaced** by `corner` (the now-fixed bend where
 * the previewed segment turns), and only then are the new live endpoints
 * (`rest`) appended so the path keeps tracking the cursor from the new bend.
 *
 * The result is normalised with {@link cleanPath}, which drops any duplicate or
 * collinear points the new bend may have introduced.
 *
 * @param path - the current connection path
 * @param corner - the fixed bend that replaces the provisional last waypoint
 * @param rest - the new live endpoint(s) extending the path past the bend
 * @returns the extended, normalised path
 */
export function extendConnectPointPaths(path, corner, ...rest) {
    const next = [...path.slice(0, -1), corner, ...rest];
    cleanPath(next);
    return next;
}
/**
 * The single 90° bend that keeps an orthogonal connection path going from its
 * last committed waypoint toward a `target` point.
 *
 * A connection path's last two points play two distinct roles. `lastFixed`
 * (second-to-last) is the **anchor** the bend is drawn from — the returned
 * `corner` reuses one of its coordinates. The final, `provisional` point is used
 * **only** to reveal the orientation of the segment that arrived at `lastFixed`
 * (by comparing their x's); its coordinates are never used directly. A single
 * point could not tell us that orientation, hence both are needed.
 *
 * The path leaves `lastFixed` continuing in that **same** orientation, then
 * bends once at `corner` to line up with the `target`:
 *
 * ```text
 *   last segment horizontal          last segment vertical
 *   ───▶ lastFixed                    lastFixed
 *              │ (turn down)               └────▶ corner ─▶ target
 *              ▼                        (keep going, then turn across)
 *         corner ──▶ target
 * ```
 *
 * @param path - the current connection path (needs at least its last two points)
 * @param target - the point the bent path should line up with
 * @returns the bend `corner`
 */
export function elbowCorner(path, target) {
    // Only the orientation of the last committed segment matters: it ran
    // vertically when its two endpoints share an x-coordinate.
    const [lastFixed, provisional] = path.slice(-2);
    const lastSegmentWasVertical = lastFixed[0] === provisional[0];
    // Leave `lastFixed` in the same orientation, then bend once toward the target:
    //  - vertical last segment  -> keep lastFixed's x, travel to the target's y
    //  - horizontal last segment -> keep lastFixed's y, travel to the target's x
    return lastSegmentWasVertical
        ? [lastFixed[0], target[1]]
        : [target[0], lastFixed[1]];
}
/**
 * Compute the live "elbow" that previews the in-progress segment of a
 * connection as it follows the cursor.
 *
 * The bend is {@link elbowCorner} toward the target. The target is the bare
 * `cursor`, unless it hovers a snap target that supplies its own `far` approach
 * point and `near` terminal endpoint (the preview then runs
 * `corner → far → near`; without a snap target `far` and `near` are both the
 * cursor, i.e. the `far → near` stub has zero length).
 *
 * The returned `corner`, `far`, `near` are exactly the points
 * {@link extendConnectPointPaths} commits on click, so the preview and the
 * committed geometry cannot drift apart.
 *
 * @param path - the current connection path (needs at least its last two points)
 * @param cursor - the live cursor position
 * @param snap - optional snap-target endpoints (`far` approach, then `near` terminal)
 * @returns the bend `corner` and the `far`/`near` endpoints of the preview
 */
export function connectPreviewElbow(path, cursor, snap) {
    // Where the preview ends: the bare cursor, or a snap target's own endpoints.
    const far = snap ? snap.far : cursor;
    const near = snap ? snap.near : cursor;
    return { corner: elbowCorner(path, far), far, near };
}
export function cleanPath(path) {
    let i = path.length - 2;
    while (i > 0) {
        const [x, y] = path[i];
        const [nx, ny] = path[i + 1];
        const [px, py] = path[i - 1];
        if ((x === nx && y === ny) ||
            (x === nx && x === px) ||
            (y === ny && y === py)) {
            path.splice(i, 1);
        }
        i -= 1;
    }
}
//# sourceMappingURL=geometry.js.map