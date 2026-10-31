import { expect } from '@open-wc/testing';
import { ConnectionRouter, connectHeading, extendRoute, finishRoute, snapApproachPoint, } from './routing.js';
function insideAny(point, obstacles) {
    return obstacles.some(([x, y, w, h]) => point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h);
}
/** Points on a route's segments at every half-grid step. */
function traversed(route) {
    return route.slice(1).flatMap(([x, y], i) => {
        const [px, py] = route[i];
        const steps = Math.round((Math.abs(x - px) + Math.abs(y - py)) * 2);
        return Array.from({ length: steps + 1 }, (_, s) => [
            px + ((x - px) * s) / steps,
            py + ((y - py) * s) / steps,
        ]);
    });
}
describe('routing', () => {
    describe('ConnectionRouter', () => {
        it('routes a straight line when nothing is in the way', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([1, 1], [1, 0], [6, 1])).to.deep.equal([
                [1, 1],
                [6, 1],
            ]);
        });
        it('uses a single bend when one is enough', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([1, 1], [1, 0], [6, 4])).to.deep.equal([
                [1, 1],
                [6, 1],
                [6, 4],
            ]);
        });
        it('routes around an obstacle with orthogonal segments only', () => {
            const obstacles = [[3, 0, 1, 5]];
            const router = new ConnectionRouter(10, 10, obstacles);
            const route = router.route([1, 2.5], [1, 0], [6, 2.5]);
            expect(route[0]).to.deep.equal([1, 2.5]);
            expect(route[route.length - 1]).to.deep.equal([6, 2.5]);
            route.slice(1).forEach(([x, y], i) => {
                expect(x === route[i][0] || y === route[i][1]).to.be.true;
            });
            traversed(route).forEach((point) => {
                expect(insideAny(point, obstacles), `${point}`).to.be.false;
            });
        });
        it('prefers few bends over a staircase', () => {
            const router = new ConnectionRouter(20, 20, []);
            const route = router.route([1, 1], [0, 1], [15, 12]);
            expect(route).to.have.length(3);
        });
        it('does not double back along its heading', () => {
            const router = new ConnectionRouter(10, 10, []);
            const route = router.route([5, 5], [1, 0], [2, 5]);
            const reverses = route[1][1] === 5 && route[1][0] < 5;
            expect(reverses).to.be.false;
        });
        it('may turn immediately at a start that is clear of obstacles', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([5, 5], [1, 0], [5, 8])).to.deep.equal([
                [5, 5],
                [5, 8],
            ]);
        });
        it('leaves a terminal on an obstacle boundary along the heading', () => {
            const router = new ConnectionRouter(10, 10, [[4, 4, 1, 1]]);
            const route = router.route([4.5, 4], [0, -1], [8, 1]);
            expect(route[0]).to.deep.equal([4.5, 4]);
            expect(route[1][0]).to.equal(4.5);
            expect(route[1][1]).to.be.lessThan(4);
        });
        it('snaps the start to the half-grid', () => {
            const router = new ConnectionRouter(10, 10, [[4, 4, 1, 1]]);
            const route = router.route([4.5, 4.16], [0, -1], [4.5, 1]);
            expect(route).to.deep.equal([
                [4.5, 4],
                [4.5, 1],
            ]);
        });
        it('returns undefined when the target is inside an obstacle', () => {
            const router = new ConnectionRouter(10, 10, [[4, 4, 1, 1]]);
            expect(router.route([1, 1], [1, 0], [4.5, 4.5])).to.be.undefined;
        });
        it('returns undefined when the target is out of bounds', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([1, 1], [1, 0], [11, 1])).to.be.undefined;
        });
        it('returns undefined when the target is walled off', () => {
            const wall = [
                [0, 4, 10, 1],
            ];
            const router = new ConnectionRouter(10, 10, wall);
            expect(router.route([1, 1], [0, 1], [1, 8])).to.be.undefined;
        });
        it('returns undefined when the start can only be left out of bounds', () => {
            const router = new ConnectionRouter(10, 10, [[0, 4, 1, 1]]);
            expect(router.route([0, 4.5], [-1, 0], [5, 5])).to.be.undefined;
        });
        it('routes through obstacles and wires at a price when soft', () => {
            const wall = [[0, 4, 10, 1]];
            expect(new ConnectionRouter(10, 10, wall).route([1, 1], [0, 1], [1, 8])).to
                .be.undefined;
            const soft = new ConnectionRouter(10, 10, wall, [], 'soft');
            expect(soft.route([1, 1], [0, 1], [1, 8])).to.deep.equal([
                [1, 1],
                [1, 8],
            ]);
        });
        it('goes round obstacles when it is cheaper than through them', () => {
            const soft = new ConnectionRouter(10, 10, [[3, 0, 1, 8]], [], 'soft');
            const route = soft.route([1, 4.5], [1, 0], [6, 4.5]);
            traversed(route).forEach((point) => {
                expect(insideAny(point, [[3, 0, 1, 8]]), `${point}`).to.be.false;
            });
        });
        it('turns on an equipment border in tight spots when tight', () => {
            const stacked = [[3, 3, 1, 1], [3, 4, 1, 1]];
            expect(new ConnectionRouter(10, 10, stacked).route([3.5, 4], [0, 1], [8, 4]))
                .to.be.undefined;
            const tight = new ConnectionRouter(10, 10, stacked, [], 'tight');
            expect(tight.route([3.5, 4], [0, 1], [8, 4])).to.deep.equal([
                [3.5, 4],
                [8, 4],
            ]);
        });
        it('can end on a border it shares with its start when tight', () => {
            const stacked = [[3, 3, 1, 1], [3, 4, 1, 1]];
            const tight = new ConnectionRouter(10, 10, stacked, [], 'tight');
            expect(tight.route([3.5, 4], [0, 1], [3.5, 4])).to.deep.equal([[3.5, 4]]);
        });
        it('still leaves straight when tight if there is room', () => {
            const tight = new ConnectionRouter(10, 10, [[3, 3, 1, 1]], [], 'tight');
            expect(tight.route([3.5, 4], [0, 1], [3.5, 8])).to.deep.equal([
                [3.5, 4],
                [3.5, 8],
            ]);
        });
        it('never enters the inside of equipment when tight', () => {
            const tight = new ConnectionRouter(10, 10, [[3, 3, 1, 1]], [], 'tight');
            expect(tight.route([1, 3.5], [1, 0], [3.5, 3.5])).to.be.undefined;
        });
        it('returns undefined for a blocked start without a heading', () => {
            const router = new ConnectionRouter(10, 10, [[4, 4, 1, 1]]);
            expect(router.route([4.5, 4], [0, 0], [8, 1])).to.be.undefined;
        });
        it('tries both directions when there is no heading', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([1, 1], [0, 0], [6, 1])).to.deep.equal([
                [1, 1],
                [6, 1],
            ]);
        });
        it('returns the start alone when it is the target', () => {
            const router = new ConnectionRouter(10, 10, []);
            expect(router.route([2, 2], [1, 0], [2, 2])).to.deep.equal([[2, 2]]);
        });
    });
    describe('existing wires', () => {
        const wire = (net, ...points) => ({ net, points });
        it('goes round a wire rather than crossing it, even by a long way', () => {
            const router = new ConnectionRouter(20, 10, [], [
                { net: 'w', points: [[2, 5], [18, 5]] },
            ]);
            const route = router.route([10, 1], [0, 1], [10, 9]);
            expect(route, 'routable').to.exist;
            traversed(route).forEach(([x, y]) => {
                expect(y === 5 && x > 2 && x < 18, `${x},${y}`).to.be.false;
            });
        });
        it('prefers crossing a wire to going through equipment in a soft router', () => {
            const router = new ConnectionRouter(10, 10, [[3, 4, 4, 2]], [{ net: 'w', points: [[0, 7], [10, 7]] }], 'soft');
            const route = router.route([5, 1], [0, 1], [5, 9]);
            expect(route, 'routable').to.exist;
            traversed(route).forEach(([x, y]) => {
                expect(x > 3 && x < 7 && y > 4 && y < 6, `${x},${y}`).to.be.false;
            });
            expect(traversed(route).some(([, y]) => y === 7), 'crosses the wire').to.be.true;
        });
        it('crosses a wire straight through its interior', () => {
            const router = new ConnectionRouter(10, 10, [], [wire('a', [0, 5], [10, 5])]);
            expect(router.route([5, 1], [0, 1], [5, 9])).to.deep.equal([
                [5, 1],
                [5, 9],
            ]);
        });
        it('never turns on or runs along a wire', () => {
            const router = new ConnectionRouter(10, 10, [], [wire('a', [0, 5], [10, 5])]);
            const route = router.route([1, 4.5], [1, 0], [9, 5.5]);
            expect(route, 'routable').to.exist;
            route.forEach(([, y]) => expect(y).to.not.equal(5));
            traversed(route).forEach(([x, y]) => {
                if (y === 5) {
                    expect(Number.isInteger(x * 2)).to.be.true;
                }
            });
        });
        it('does not touch the ends or bends of a wire', () => {
            const router = new ConnectionRouter(10, 10, [], [wire('a', [3, 5], [7, 5], [7, 8])]);
            [[3, 5], [7, 5]].forEach(([x, y]) => {
                const route = router.route([x, 1], [0, 1], [x, 9]);
                expect(route, 'routable').to.exist;
                traversed(route).forEach((point) => {
                    expect(point).to.not.deep.equal([x, y]);
                });
            });
        });
        it('does not cross where two wires cross', () => {
            const router = new ConnectionRouter(10, 10, [], [wire('a', [0, 5], [10, 5]), wire('b', [5, 0], [5, 10])]);
            const route = router.route([2, 1], [0, 1], [8, 9]);
            traversed(route).forEach((point) => {
                expect(point).to.not.deep.equal([5, 5]);
            });
        });
        it('avoids the legs already drawn for the connection', () => {
            const router = new ConnectionRouter(10, 10, []);
            const own = [[1, 5], [5, 5]];
            const route = router.route([5, 5], [1, 0], [1, 6], own);
            expect(route, 'routable').to.exist;
            traversed(route.slice(1)).forEach(([x, y]) => {
                expect(y === 5 && x < 5, `${x},${y}`).to.be.false;
            });
        });
    });
    describe('bus bars', () => {
        const bus = (...points) => ({ net: 'bus', points, bus: true });
        it('are crossed like any wire when going round is not possible', () => {
            const router = new ConnectionRouter(10, 10, [], [bus([0, 5], [10, 5])]);
            expect(router.route([5, 1], [0, 1], [5, 9])).to.deep.equal([
                [5, 1],
                [5, 9],
            ]);
        });
        it('are gone round when that is possible', () => {
            const router = new ConnectionRouter(10, 10, [], [bus([2, 5], [8, 5])]);
            const route = router.route([5, 1], [0, 1], [5, 9]);
            expect(route, 'routable').to.exist;
            traversed(route).forEach(([x, y]) => {
                expect(y === 5 && x > 2 && x < 8, `${x},${y}`).to.be.false;
            });
        });
        it('still leave a route when they and a wire block the way round', () => {
            const router = new ConnectionRouter(10, 10, [], [bus([2, 5], [8, 5]), { net: 'w', points: [[2, 5.5], [8, 5.5]] }]);
            expect(router.route([5, 1], [0, 1], [5, 9])).to.exist;
        });
        it('do not stop an ordinary wire from being crossed straight', () => {
            const router = new ConnectionRouter(10, 10, [], [
                { net: 'w', points: [[0, 5], [10, 5]] },
            ]);
            expect(router.route([5, 1], [0, 1], [5, 9])).to.deep.equal([
                [5, 1],
                [5, 9],
            ]);
        });
        it('can still be connected to', () => {
            const router = new ConnectionRouter(10, 10, [], [bus([2, 5], [8, 5])]);
            expect(router.routeToNet([5, 1], [0, 1], 'bus')).to.deep.equal([
                [5, 1],
                [5, 5],
            ]);
        });
    });
    describe('routeToNet', () => {
        const net = { net: 'a', points: [[2, 6], [8, 6]] };
        it('ends on the wire, arriving straight on', () => {
            const router = new ConnectionRouter(10, 10, [], [net]);
            expect(router.routeToNet([5, 1], [0, 1], 'a')).to.deep.equal([
                [5, 1],
                [5, 6],
            ]);
        });
        it('meets the wire at the nearest reachable point', () => {
            const router = new ConnectionRouter(10, 10, [], [net]);
            const route = router.routeToNet([1, 2], [1, 0], 'a');
            const end = route[route.length - 1];
            expect(end[1]).to.equal(6);
            expect(end[0]).to.be.within(2.5, 7.5);
            expect(route[route.length - 2][0]).to.equal(end[0]);
        });
        it('does not cross the net on its way to it', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[2, 6], [8, 6], [8, 3]] }]);
            const route = router.routeToNet([5, 9], [0, -1], 'a');
            traversed(route.slice(0, -1)).forEach(([x, y]) => {
                expect(y === 6 && x >= 2 && x <= 8).to.be.false;
            });
        });
        it('ends straight into a free end when it is pointed at', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5]], bus: true }]);
            expect(router.routeToNet([1, 5], [1, 0], 'a', [], [3, 5])).to.deep.equal([
                [1, 5],
                [3, 5],
            ]);
        });
        it('meets a free end of a bus only along it, never across it', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5]], bus: true }]);
            const route = router.routeToNet([3, 1], [0, 1], 'a', [], [3, 5]);
            expect(route[route.length - 1]).to.deep.equal([3, 5]);
            expect(route[route.length - 2][1]).to.equal(5);
        });
        it('meets the free end of an ordinary wire from either direction', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5]] }]);
            const route = router.routeToNet([3, 1], [0, 1], 'a', [], [3, 5]);
            expect(route).to.deep.equal([
                [3, 1],
                [3, 5],
            ]);
        });
        it('ends on a bend when it is pointed at', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5], [7, 8]] }]);
            expect(router.routeToNet([9, 5], [-1, 0], 'a', [], [7, 5])).to.deep.equal([
                [9, 5],
                [7, 5],
            ]);
        });
        it('does not end on a bend or end that is not pointed at', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5]] }]);
            expect(router.routeToNet([1, 5], [1, 0], 'a')).to.not.deep.equal([
                [1, 5],
                [3, 5],
            ]);
            const route = router.routeToNet([1, 5], [1, 0], 'a', [], [5, 5]);
            const end = route[route.length - 1];
            expect(end[0]).to.be.within(3.5, 6.5);
        });
        it('cannot end on a terminal', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5]], terminals: [[3, 5]] }]);
            const route = router.routeToNet([1, 5], [1, 0], 'a', [], [3, 5]);
            expect(route[route.length - 1]).to.not.deep.equal([3, 5]);
        });
        it('does not pass through a bend on the way to another point', () => {
            const router = new ConnectionRouter(10, 10, [], [{ net: 'a', points: [[3, 5], [7, 5], [7, 8]] }]);
            const route = router.route([1, 5], [1, 0], [9, 5]);
            traversed(route).forEach((point) => {
                expect(point).to.not.deep.equal([3, 5]);
            });
        });
        it('is undefined for a net without a wire to meet', () => {
            const router = new ConnectionRouter(10, 10, [], [net]);
            expect(router.routeToNet([5, 1], [0, 1], 'b')).to.be.undefined;
        });
        it('is undefined when the wire cannot be reached', () => {
            const router = new ConnectionRouter(10, 10, [[0, 4, 10, 1]], [net]);
            expect(router.routeToNet([5, 1], [0, 1], 'a')).to.be.undefined;
        });
    });
    describe('connectHeading', () => {
        it('is the direction of the last committed segment', () => {
            expect(connectHeading([[0, 0], [0, 3]])).to.deep.equal([0, 1]);
            expect(connectHeading([[0, 3], [0, 0]])).to.deep.equal([0, -1]);
            expect(connectHeading([[0, 0], [2, 0]])).to.deep.equal([1, 0]);
            expect(connectHeading([[2, 0], [0, 0]])).to.deep.equal([-1, 0]);
        });
        it('only considers the last two points', () => {
            expect(connectHeading([[9, 9], [1, 1], [1, 4]])).to.deep.equal([0, 1]);
        });
        it('is zero for a degenerate segment', () => {
            expect(connectHeading([[1, 1], [1, 1]])).to.deep.equal([0, 0]);
        });
    });
    describe('snapApproachPoint', () => {
        it('lies half a step beyond the terminal, away from the equipment', () => {
            expect(snapApproachPoint({ near: [5.5, 4.16], far: [5.5, 4] })).to.deep.equal([5.5, 3.5]);
            expect(snapApproachPoint({ near: [5.84, 4.5], far: [6, 4.5] })).to.deep.equal([6.5, 4.5]);
        });
    });
    describe('finishRoute', () => {
        it('replaces the provisional last point and appends the tail', () => {
            const path = [[1, 1], [1, 0.5]];
            expect(finishRoute(path, [[1, 0.5], [1, 3], [5, 3]], [5, 3.5], [5, 3.84])).to.deep.equal([
                [1, 1],
                [1, 3],
                [5, 3],
                [5, 3.84],
            ]);
        });
        it('does not mutate the path', () => {
            const path = [[0, 0], [0, 1]];
            finishRoute(path, [[0, 1], [4, 1]]);
            expect(path).to.deep.equal([[0, 0], [0, 1]]);
        });
    });
    describe('extendRoute', () => {
        it('ends in a provisional point that keeps the direction of travel', () => {
            const path = [[1, 1], [1, 0.5]];
            const next = extendRoute(path, [[1, 0.5], [1, 3], [5, 3]]);
            expect(next).to.deep.equal([
                [1, 1],
                [1, 3],
                [5, 3],
                [5.5, 3],
            ]);
            expect(connectHeading(next)).to.deep.equal([1, 0]);
        });
        it('keeps the anchor when the route continues straight', () => {
            const first = extendRoute([[1, 1], [1, 0.5]], [[1, 0.5], [1, 3]]);
            const second = extendRoute(first, [[1, 3], [1, 6]]);
            expect(second).to.deep.equal([
                [1, 1],
                [1, 6],
                [1, 6.5],
            ]);
        });
    });
});
//# sourceMappingURL=routing.spec.js.map