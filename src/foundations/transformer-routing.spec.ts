import { expect } from '@open-wc/testing';

import { ConnectionRouter } from './routing.js';
import { leaveRects, obstacleRects, windingPort } from './obstacles.js';
import { transformerWindingMeasures } from './transformer.js';
import { sldFixture } from '../test-helpers.js';

import type { Point, Rect } from './geometry.js';
import type { TransformerKind } from './sld-attributes.js';

const inside = ([px, py]: Point, rects: Rect[]) =>
  rects.some(
    ([x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h,
  );

/** Every half-grid point along the legs of a route. */
function along(route: Point[]): Point[] {
  return route.slice(1).flatMap(([x, y], i) => {
    const [px, py] = route[i];
    const steps = Math.round(Math.max(Math.abs(x - px), Math.abs(y - py)) * 2);
    return Array.from({ length: steps + 1 }, (_, s): Point => [
      px + ((x - px) * s) / Math.max(steps, 1),
      py + ((y - py) * s) / Math.max(steps, 1),
    ]);
  });
}

function transformer(
  windings: number,
  kind: TransformerKind,
  rot: number,
  flip: boolean,
) {
  const doc = sldFixture({
    vl: { w: 40, h: 20 },
    bay: { w: 30, h: 15 },
    children: `<PowerTransformer name="T1">
      <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="10" smth:y="8" smth:rot="${rot}" smth:kind="${kind}"${flip ? ' smth:flip="true"' : ''}/></Private>
      ${Array.from({ length: windings }, (_, i) => `<TransformerWinding name="W${i + 1}"/>`).join('')}
    </PowerTransformer>`,
  });
  return doc.querySelector('PowerTransformer')!;
}

describe('windingPort', () => {
  it('leaves straight away from the centre, on to the half-grid', () => {
    expect(windingPort([3.5, 5.5], [3.5, 4.3])).to.deep.equal({
      point: [3.5, 4.3],
      approach: [3.5, 4],
      outward: [0, -1],
    });
    expect(windingPort([3.5, 5.5], [4.2, 5.5]).approach).to.deep.equal([4.5, 5.5]);
  });

  it('steps on when the terminal is on the half-grid', () => {
    expect(windingPort([3.5, 5.5], [3.5, 7]).approach).to.deep.equal([3.5, 7.5]);
  });
});

describe('leaveRects', () => {
  it('stays where it is outside all areas', () => {
    expect(leaveRects([5, 5], [1, 0], [[0, 0, 2, 2]])).to.deep.equal([5, 5]);
  });

  it('goes on until clear of the borders of every area', () => {
    const rects: Rect[] = [[0, 0, 2, 2], [-1.5, 0, 2, 2]];
    expect(leaveRects([-1, 0], [-1, 0], rects)).to.deep.equal([-2, 0]);
  });
});

describe('transformer terminals', () => {
  const kinds: TransformerKind[] = ['default', 'auto', 'earthing'];
  const targets: Point[] = [
    [10, 2], [20, 2], [24, 12], [20, 18], [10, 18], [2, 18], [2, 12], [2, 2],
  ];

  [1, 2, 3].forEach(windings =>
    kinds.forEach(kind =>
      [0, 1, 2, 3].forEach(rot =>
        [false, true].forEach((flip) => {
          const name = `${windings} winding(s), ${kind}, rot ${rot}${flip ? ', flipped' : ''}`;

          it(`can be connected from every terminal of ${name}`, () => {
            const element = transformer(windings, kind, rot, flip);
            const rects = obstacleRects(element);
            const router = new ConnectionRouter(40, 20, rects);
            const position: Point = [10, 8];
            const attrs = { rot: rot as 0 | 1 | 2 | 3, kind, flip };

            Array.from(element.querySelectorAll('TransformerWinding')).forEach(
              (winding) => {
                const { center, terminals } = transformerWindingMeasures(
                  winding,
                  position,
                  attrs,
                  '',
                );
                Object.entries(terminals).forEach(([terminal, point]) => {
                  const label = `${winding.getAttribute('name')} ${terminal}`;
                  const port = windingPort(center, point);

                  const outwards =
                    (port.approach[0] - point[0]) * (point[0] - center[0]) +
                    (port.approach[1] - point[1]) * (point[1] - center[1]);
                  expect(outwards, `${label} leaves outwards`).to.be.greaterThan(0);

                  const origin = leaveRects(port.approach, port.outward, rects);
                  expect(inside(origin, rects), `${label} starts clear`).to.be.false;

                  targets.forEach((target) => {
                    const route = router.route(origin, port.outward, target);
                    expect(route, `${label} to ${target}`).to.exist;
                    expect(
                      along(route!).filter(p => inside(p, rects)),
                      `${label} to ${target} keeps clear of the windings`,
                    ).to.deep.equal([]);
                  });
                });
              },
            );
          });
        }),
      ),
    ),
  );
});
