import { expect } from '@open-wc/testing';
import { contains, overlaps, distance, findIntersection, cleanPath, extendConnectPointPaths, connectPreviewElbow, elbowCorner, } from './geometry.js';
describe('geometry', () => {
    describe('contains', () => {
        it('returns true when outer fully contains inner', () => {
            const outer = [0, 0, 10, 10];
            const inner = [1, 1, 5, 5];
            expect(contains(outer, inner)).to.be.true;
        });
        it('returns true when rects are identical', () => {
            const rect = [2, 3, 4, 5];
            expect(contains(rect, rect)).to.be.true;
        });
        it('returns true when inner touches edges', () => {
            const outer = [0, 0, 10, 10];
            const inner = [0, 0, 10, 10];
            expect(contains(outer, inner)).to.be.true;
        });
        it('returns false when inner exceeds right edge', () => {
            const outer = [0, 0, 10, 10];
            const inner = [5, 0, 10, 5];
            expect(contains(outer, inner)).to.be.false;
        });
        it('returns false when inner exceeds bottom edge', () => {
            const outer = [0, 0, 10, 10];
            const inner = [0, 5, 5, 10];
            expect(contains(outer, inner)).to.be.false;
        });
        it('returns false when inner starts before outer', () => {
            const outer = [2, 2, 5, 5];
            const inner = [1, 1, 3, 3];
            expect(contains(outer, inner)).to.be.false;
        });
    });
    describe('overlaps', () => {
        it('returns true for overlapping rects', () => {
            const a = [0, 0, 5, 5];
            const b = [3, 3, 5, 5];
            expect(overlaps(a, b)).to.be.true;
        });
        it('returns true when one contains the other', () => {
            const a = [0, 0, 10, 10];
            const b = [2, 2, 3, 3];
            expect(overlaps(a, b)).to.be.true;
        });
        it('returns false when separated horizontally', () => {
            const a = [0, 0, 5, 5];
            const b = [6, 0, 5, 5];
            expect(overlaps(a, b)).to.be.false;
        });
        it('returns false when separated vertically', () => {
            const a = [0, 0, 5, 5];
            const b = [0, 6, 5, 5];
            expect(overlaps(a, b)).to.be.false;
        });
        it('returns false when touching edges (no overlap)', () => {
            const a = [0, 0, 5, 5];
            const b = [5, 0, 5, 5];
            expect(overlaps(a, b)).to.be.false;
        });
        it('is symmetric', () => {
            const a = [0, 0, 5, 5];
            const b = [3, 3, 5, 5];
            expect(overlaps(a, b)).to.equal(overlaps(b, a));
        });
    });
    describe('distance', () => {
        it('returns 0 for identical points', () => {
            expect(distance([3, 4], [3, 4])).to.equal(0);
        });
        it('returns Manhattan distance for horizontal offset', () => {
            expect(distance([0, 0], [5, 0])).to.equal(5);
        });
        it('returns Manhattan distance for vertical offset', () => {
            expect(distance([0, 0], [0, 7])).to.equal(7);
        });
        it('returns Manhattan distance for diagonal offset', () => {
            expect(distance([1, 2], [4, 6])).to.equal(7);
        });
        it('handles negative coordinates', () => {
            expect(distance([-1, -2], [2, 3])).to.equal(8);
        });
    });
    describe('findIntersection', () => {
        it('returns p1 when it lies on the line segment', () => {
            const p1 = [3, 0];
            const p2 = [3, 5];
            const lp1 = [0, 0];
            const lp2 = [5, 0];
            expect(findIntersection(p1, p2, lp1, lp2)).to.deep.equal(p1);
        });
        it('returns lp1 when it lies on the first segment', () => {
            const p1 = [0, 0];
            const p2 = [5, 0];
            const lp1 = [3, 0];
            const lp2 = [3, 5];
            expect(findIntersection(p1, p2, lp1, lp2)).to.deep.equal(lp1);
        });
        it('returns lp2 when it lies on the first segment', () => {
            const p1 = [0, 0];
            const p2 = [5, 0];
            const lp1 = [3, 5];
            const lp2 = [3, 0];
            expect(findIntersection(p1, p2, lp1, lp2)).to.deep.equal(lp2);
        });
        it('returns closest point on line when no direct intersection', () => {
            const p1 = [0, 0];
            const p2 = [0, 5];
            const lp1 = [2, 2];
            const lp2 = [2, 8];
            const result = findIntersection(p1, p2, lp1, lp2);
            expect(result[0]).to.equal(2);
        });
    });
    describe('cleanPath', () => {
        it('removes duplicate consecutive points', () => {
            const path = [[0, 0], [1, 1], [1, 1], [2, 2]];
            cleanPath(path);
            expect(path).to.deep.equal([[0, 0], [1, 1], [2, 2]]);
        });
        it('removes collinear horizontal points', () => {
            const path = [[0, 0], [1, 0], [2, 0], [3, 0]];
            cleanPath(path);
            expect(path).to.deep.equal([[0, 0], [3, 0]]);
        });
        it('removes collinear vertical points', () => {
            const path = [[0, 0], [0, 1], [0, 2], [0, 3]];
            cleanPath(path);
            expect(path).to.deep.equal([[0, 0], [0, 3]]);
        });
        it('preserves corner points', () => {
            const path = [[0, 0], [5, 0], [5, 5]];
            cleanPath(path);
            expect(path).to.deep.equal([[0, 0], [5, 0], [5, 5]]);
        });
        it('handles path with two points', () => {
            const path = [[0, 0], [5, 5]];
            cleanPath(path);
            expect(path).to.deep.equal([[0, 0], [5, 5]]);
        });
        it('handles empty path', () => {
            const path = [];
            cleanPath(path);
            expect(path).to.deep.equal([]);
        });
    });
    describe('extendConnectPointPaths', () => {
        it('replaces the provisional last waypoint and appends the rest', () => {
            const path = [[0, 0], [5, 0]];
            const next = extendConnectPointPaths(path, [5, 2], [5, 5], [8, 5]);
            expect(next).to.deep.equal([[0, 0], [5, 2], [5, 5], [8, 5]]);
        });
        it('does not mutate the input array', () => {
            const path = [[0, 0], [5, 0]];
            const snapshot = [[0, 0], [5, 0]];
            extendConnectPointPaths(path, [5, 2], [5, 5]);
            expect(path).to.deep.equal(snapshot);
        });
        it('normalises the result with cleanPath', () => {
            const path = [[0, 0], [3, 0]];
            // replacing the last point keeps the run collinear, so it collapses
            const next = extendConnectPointPaths(path, [5, 0], [8, 0]);
            expect(next).to.deep.equal([[0, 0], [8, 0]]);
        });
    });
    describe('elbowCorner', () => {
        it('keeps the anchor x and moves to the target y after a vertical segment', () => {
            // last segment [0,0]->[0,3] is vertical (shared x = 0)
            expect(elbowCorner([[0, 0], [0, 3]], [5, 7])).to.deep.equal([0, 7]);
        });
        it('keeps the anchor y and moves to the target x after a horizontal segment', () => {
            // last segment [0,0]->[3,0] is horizontal (shared y = 0)
            expect(elbowCorner([[0, 0], [3, 0]], [5, 7])).to.deep.equal([5, 0]);
        });
        it('reads orientation from the last two points only', () => {
            // leading points are irrelevant; only [1,1]->[1,4] (vertical) matters
            expect(elbowCorner([[9, 9], [1, 1], [1, 4]], [6, 2])).to.deep.equal([
                1, 2,
            ]);
        });
    });
    describe('connectPreviewElbow', () => {
        it('continues vertically then bends across when the last segment was vertical', () => {
            // last committed segment [0,0]->[0,3] is vertical (shared x = 0)
            const path = [[0, 0], [0, 3]];
            const { corner, far, near } = connectPreviewElbow(path, [5, 7]);
            // keep x=0 down to the cursor's y=7, then the bend runs across to x=5
            expect(corner).to.deep.equal([0, 7]);
            // no snap target, so both endpoints are just the cursor
            expect(far).to.deep.equal([5, 7]);
            expect(near).to.deep.equal([5, 7]);
        });
        it('continues horizontally then bends down when the last segment was horizontal', () => {
            // last committed segment [0,0]->[3,0] is horizontal (shared y = 0)
            const path = [[0, 0], [3, 0]];
            const { corner, far, near } = connectPreviewElbow(path, [5, 7]);
            // keep y=0 across to the cursor's x=5, then the bend runs down to y=7
            expect(corner).to.deep.equal([5, 0]);
            expect(far).to.deep.equal([5, 7]);
            expect(near).to.deep.equal([5, 7]);
        });
        it('routes to a snap target using its own far/near endpoints, not the cursor', () => {
            const path = [[0, 0], [3, 0]]; // horizontal
            const snap = { far: [10, 6], near: [10, 4] };
            // cursor is ignored once a snap target is supplied
            const { corner, far, near } = connectPreviewElbow(path, [5, 7], snap);
            // horizontal last segment -> keep y=0, travel across to the snap x=10
            expect(corner).to.deep.equal([10, 0]);
            expect(far).to.deep.equal([10, 6]);
            expect(near).to.deep.equal([10, 4]);
        });
        it('returns exactly the points a subsequent extendConnectPointPaths commits', () => {
            const path = [[0, 0], [3, 0]]; // horizontal, provisional = [3,0]
            const { corner, far, near } = connectPreviewElbow(path, [5, 7]);
            const committed = extendConnectPointPaths(path, corner, far, near);
            // committing drops the provisional [3,0], inserts the corner [5,0], and —
            // because with no snap target far and near are the *same* cursor point —
            // the duplicated [5,7] is collapsed to one by cleanPath:
            expect(committed).to.deep.equal([[0, 0], [5, 0], [5, 7]]);
        });
    });
});
//# sourceMappingURL=geometry.spec.js.map