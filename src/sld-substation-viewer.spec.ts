import { fixture, html, expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';

import { SldSubstationViewer } from './sld-substation-viewer.js';
import * as interactions from './foundations/interaction-mode.js';
import type { Point } from './foundations/geometry.js';
import type { Style } from './foundations/sld-attributes.js';

customElements.define('perf-sld-substation-viewer', SldSubstationViewer);

const SLD_NS = 'https://openscd.org/SCL/SSD/SLD/v0';

/**
 * Scale of the generated substation. Kept modest by default so the spec stays a
 * few hundred milliseconds in CI; bump the grid to reproduce the "large file"
 * (1000+ equipment) numbers from `demo/sample-large.scd` locally.
 */
const VL_COLS = 6;
const VL_ROWS = 4;
const BAY_COLS = 5;
const BAY_ROWS = 4;
const EQ_PER_BAY = 4;

const BAY_W = 6;
const BAY_H = 6;
const MARGIN = 1;

const VL_W = BAY_COLS * (BAY_W + MARGIN) + MARGIN;
const VL_H = BAY_ROWS * (BAY_H + MARGIN) + MARGIN;
const SUB_W = VL_COLS * (VL_W + MARGIN) + MARGIN;
const SUB_H = VL_ROWS * (VL_H + MARGIN) + MARGIN;

const EQ_TYPES = ['CBR', 'DIS', 'CTR', 'VTR', 'SMC', 'BAT'];

/**
 * Build a schema-valid substation laid out on a regular grid: `VL_COLS×VL_ROWS`
 * voltage levels, each holding `BAY_COLS×BAY_ROWS` bays, each holding
 * `EQ_PER_BAY` conducting equipment plus a connectivity node. All SLD layout
 * coordinates are absolute in substation space and non-overlapping.
 */
function largeSubstationDoc(): XMLDocument {
  const parts: string[] = [];
  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" xmlns:sld="${SLD_NS}">` +
      `<Substation name="S1">` +
      `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes sld:w="${SUB_W}" sld:h="${SUB_H}"/></Private>`,
  );

  let vlIndex = 0;
  for (let vr = 0; vr < VL_ROWS; vr++) {
    for (let vc = 0; vc < VL_COLS; vc++) {
      vlIndex++;
      const vlX = MARGIN + vc * (VL_W + MARGIN);
      const vlY = MARGIN + vr * (VL_H + MARGIN);
      parts.push(
        `<VoltageLevel name="V${vlIndex}">` +
          `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
          `sld:x="${vlX}" sld:y="${vlY}" sld:w="${VL_W}" sld:h="${VL_H}" ` +
          `sld:lx="${vlX}" sld:ly="${vlY}"/></Private>`,
      );

      let bayIndex = 0;
      for (let br = 0; br < BAY_ROWS; br++) {
        for (let bc = 0; bc < BAY_COLS; bc++) {
          bayIndex++;
          const bayX = vlX + MARGIN + bc * (BAY_W + MARGIN);
          const bayY = vlY + MARGIN + br * (BAY_H + MARGIN);
          const bayName = `B${vlIndex}_${bayIndex}`;
          parts.push(
            `<Bay name="${bayName}">` +
              `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
              `sld:x="${bayX}" sld:y="${bayY}" sld:w="${BAY_W}" sld:h="${BAY_H}" ` +
              `sld:lx="${bayX}" sld:ly="${bayY}"/></Private>`,
          );

          for (let e = 0; e < EQ_PER_BAY; e++) {
            const eqX = bayX + 1 + (e % (BAY_W - 1));
            const eqY = bayY + 1 + Math.floor(e / (BAY_W - 1));
            const type = EQ_TYPES[e % EQ_TYPES.length];
            parts.push(
              `<ConductingEquipment type="${type}" name="${bayName}_${type}${e}">` +
                `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
                `sld:x="${eqX}" sld:y="${eqY}" sld:rot="${e % 4}" ` +
                `sld:lx="${eqX}" sld:ly="${eqY}"/></Private>` +
                `</ConductingEquipment>`,
            );
          }

          parts.push(
            `<ConnectivityNode name="L1" pathName="S1/V${vlIndex}/${bayName}/L1"/>`,
          );
          parts.push(`</Bay>`);
        }
      }
      parts.push(`</VoltageLevel>`);
    }
  }

  parts.push(`</Substation></SCL>`);
  return new DOMParser().parseFromString(parts.join(''), 'application/xml');
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return {
    n: s.length,
    min: +s[0].toFixed(1),
    median: +q(0.5).toFixed(1),
    p90: +q(0.9).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    mean: +mean.toFixed(1),
  };
}

async function measureMoves(
  el: SldSubstationViewer,
  samples = 15,
): Promise<number[]> {
  const svg = el.sld;
  const rect = svg.getBoundingClientRect();
  const times: number[] = [];
  for (let i = 0; i < samples; i++) {
    // Step well beyond one grid cell so the mouse @state actually changes and a
    // re-render is forced; wrap inside the svg bounds.
    const cx = rect.left + 20 + ((i * 40) % Math.max(40, rect.width - 40));
    const cy = rect.top + 20 + ((i * 24) % Math.max(40, rect.height - 40));
    const start = performance.now();
    svg.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: cx,
        clientY: cy,
        bubbles: true,
      }),
    );

    await el.updateComplete;
    times.push(performance.now() - start);
  }
  return times;
}

describe('SldSubstationViewer large-file render performance', () => {
  it('reports render cost on a large generated substation', async function reportsRenderCost() {
    this.timeout(60_000);
    const doc = largeSubstationDoc();
    const substation = doc.querySelector('Substation')!;

    const t0 = performance.now();
    const el = (await fixture(html`
      <perf-sld-substation-viewer
        .doc=${doc}
        .substation=${substation}
        .docVersion=${1}
        .gridSize=${6}
        .showLabels=${true}
        .showIeds=${true}
      ></perf-sld-substation-viewer>
    `)) as SldSubstationViewer;
    await el.updateComplete;
    const initialRenderMs = performance.now() - t0;

    const gCount = el.sld.querySelectorAll('g').length;
    const bayCount = substation.querySelectorAll('Bay').length;
    const eqCount = substation.querySelectorAll('ConductingEquipment').length;

    // idle hover: whole render() re-runs on every move.
    const idle = await measureMoves(el);

    // bay move: enter placing mode with the first bay, then move.
    const bay = substation.querySelector('Bay')!;
    el.interaction = interactions.placing(bay, [0, 0]);
    await el.updateComplete;
    const placing = await measureMoves(el);
    el.interaction = interactions.idle();
    await el.updateComplete;


    console.log('\n=== SldSubstationViewer render baseline ===');
    console.log(
      `substation: ${substation.querySelectorAll('VoltageLevel').length} VLs, ` +
        `${bayCount} bays, ${eqCount} equipment; ${gCount} rendered <g>`,
    );
    console.log(`initial render: ${initialRenderMs.toFixed(1)} ms`);
    console.log('per-move (ms) idle hover:', stats(idle));
    console.log('per-move (ms) bay move :', stats(placing));


    // Sanity only — no timing thresholds (machine-dependent).
    expect(gCount).to.be.greaterThan(bayCount);
    expect(eqCount).to.equal(
      VL_COLS * VL_ROWS * BAY_COLS * BAY_ROWS * EQ_PER_BAY,
    );
  });
});

/**
 * A small, schema-valid substation (2 voltage levels × 2 bays × 2 equipment)
 * used by the guard-contract tests below. Kept tiny so each test mounts and
 * mutates in a few milliseconds — correctness, not timing, is the point here.
 */
function contractSubstationDoc(): XMLDocument {
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" xmlns:sld="${SLD_NS}">` +
      `<Substation name="S1">` +
      `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes sld:w="40" sld:h="20"/></Private>`,
  ];

  for (let v = 0; v < 2; v++) {
    const vlIndex = v + 1;
    const vlX = 1 + v * 18;
    const vlY = 1;
    parts.push(
      `<VoltageLevel name="V${vlIndex}">` +
        `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
        `sld:x="${vlX}" sld:y="${vlY}" sld:w="16" sld:h="16" ` +
        `sld:lx="${vlX}" sld:ly="${vlY}"/></Private>`,
    );

    for (let b = 0; b < 2; b++) {
      const bayX = vlX + 1 + b * 7;
      const bayY = vlY + 1;
      const bayName = `B${vlIndex}_${b + 1}`;
      parts.push(
        `<Bay name="${bayName}">` +
          `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
          `sld:x="${bayX}" sld:y="${bayY}" sld:w="6" sld:h="6" ` +
          `sld:lx="${bayX}" sld:ly="${bayY}"/></Private>`,
      );

      for (let e = 0; e < 2; e++) {
        const eqX = bayX + 1 + e;
        const eqY = bayY + 1;
        const type = EQ_TYPES[e % EQ_TYPES.length];
        parts.push(
          `<ConductingEquipment type="${type}" name="${bayName}_${type}${e}">` +
            `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes ` +
            `sld:x="${eqX}" sld:y="${eqY}" sld:rot="0" ` +
            `sld:lx="${eqX}" sld:ly="${eqY}"/></Private>` +
            `</ConductingEquipment>`,
        );
      }

      parts.push(
        `<ConnectivityNode name="L1" pathName="S1/V${vlIndex}/${bayName}/L1"/>`,
      );
      parts.push(`</Bay>`);
    }
    parts.push(`</VoltageLevel>`);
  }

  parts.push(`</Substation></SCL>`);
  return new DOMParser().parseFromString(parts.join(''), 'application/xml');
}

async function mountViewer(doc: XMLDocument): Promise<SldSubstationViewer> {
  const substation = doc.querySelector('Substation')!;
  const el = (await fixture(html`
    <perf-sld-substation-viewer
      .doc=${doc}
      .substation=${substation}
      .docVersion=${1}
      .gridSize=${6}
      .showLabels=${true}
      .showIeds=${true}
    ></perf-sld-substation-viewer>
  `)) as SldSubstationViewer;
  await el.updateComplete;
  return el;
}

/**
 * Counts how often the guarded base-layer renderers run vs. an unguarded
 * per-render probe. `render` counts `renderPlacingPreview` (called on every
 * `render()`); `base` counts the two guarded layer groups (`renderVoltageLevelLayer`
 * from the first `guard`, `renderLabelLayer` from the second) — so a base-layer
 * evaluation bumps `base` by 2, and a guard-frozen render leaves it at 0.
 */
function spyLayers(el: SldSubstationViewer): { base: number; render: number } {
  const counts = { base: 0, render: 0 };
  const host = el as unknown as Record<string, (...args: unknown[]) => unknown>;

  for (const method of ['renderVoltageLevelLayer', 'renderLabelLayer']) {
    const original = host[method].bind(el);
    host[method] = (...args: unknown[]) => {
      counts.base += 1;
      return original(...args);
    };
  }

  const originalPreview = host.renderPlacingPreview.bind(el);
  host.renderPlacingPreview = (...args: unknown[]) => {
    counts.render += 1;
    return originalPreview(...args);
  };

  return counts;
}

/** Simulate a cursor move by advancing every tracked mouse coordinate. */
async function bumpMouse(el: SldSubstationViewer, delta = 1): Promise<void> {
  const host = el as unknown as Record<string, number>;
  for (const coord of [
    'mouseX',
    'mouseY',
    'mouseX2',
    'mouseY2',
    'mouseX2f',
    'mouseY2f',
  ]) {
    host[coord] += delta;
  }
  await el.updateComplete;
}

/**
 * Direct, self-documenting contract for the base-layer `guard` memoization in
 * `render()`. The benchmark above proves it is *fast*; these prove it stays
 * *correct* — i.e. the memoized base layers are reused only while nothing they
 * depend on has changed, and are refreshed the moment something has. A dropped
 * item from `baseLayerKey` fails a specific case here with an obvious message,
 * rather than surfacing as a confusing symptom in an unrelated editor test.
 */
describe('SldSubstationViewer base-layer guard memoization', () => {
  it('reuses the base layers on cursor moves while placing', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    el.interaction = interactions.placing(doc.querySelector('Bay')!, [0, 0]);
    await el.updateComplete;

    const counts = spyLayers(el);
    counts.base = 0;
    counts.render = 0;
    await bumpMouse(el);

    expect(counts.render, 'render() re-runs to move the placing preview').to.be.greaterThan(0);
    expect(counts.base, 'base layers reused from the guard cache').to.equal(0);
  });

  it('refreshes the base layers on cursor moves while resizing', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    el.interaction = interactions.resizingBR(doc.querySelector('Bay')!);
    await el.updateComplete;

    const counts = spyLayers(el);
    counts.base = 0;
    await bumpMouse(el);

    expect(counts.base, 'resize preview tracks the cursor inside the base layer').to.be.greaterThan(0);
  });

  it('refreshes the base layers on cursor moves while connecting', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    el.interaction = interactions.connectingFrom(
      doc.querySelector('ConductingEquipment')!,
      'T1',
      [
        [3, 3],
        [3, 4],
      ],
    );
    await el.updateComplete;

    const counts = spyLayers(el);
    counts.base = 0;
    await bumpMouse(el);

    expect(counts.base, 'connect target highlight tracks the cursor inside the base layer').to.be.greaterThan(0);
  });

  it('refreshes the base layers on cursor moves while repositioning a label', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    // The repositioned label is painted inside the guarded label layer, so its
    // cursor-following preview only moves if `baseLayerKey` folds in the mouse
    // coords while `placingLabel` is active. Regression guard: dropping
    // 'placingLabel' from the mouse-tracking modes freezes the label preview.
    el.interaction = interactions.placingLabel(doc.querySelector('Bay')!, [
      0, 0,
    ]);
    await el.updateComplete;

    const counts = spyLayers(el);
    counts.base = 0;
    await bumpMouse(el);

    expect(counts.base, 'label reposition preview tracks the cursor inside the base layer').to.be.greaterThan(0);
  });

  it('skips rendering entirely on cursor moves while idle', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc); // idle by default

    const counts = spyLayers(el);
    counts.base = 0;
    counts.render = 0;
    await bumpMouse(el);

    // shouldUpdate short-circuits mouse-only changes while idle, so render()
    // never runs — the guard never even gets a chance to matter here.
    expect(counts.render, 'idle mouse move is dropped by shouldUpdate').to.equal(0);
    expect(counts.base).to.equal(0);
  });

  it('refreshes the base layers when the document version changes', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);

    const counts = spyLayers(el);
    counts.base = 0;
    el.docVersion = 2;
    await el.updateComplete;

    expect(counts.base, 'a committed doc edit must refresh the base layers').to.be.greaterThan(0);
  });

  it('refreshes the base layers when view flags or selection inputs change', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    const counts = spyLayers(el);

    const expectRefresh = async (
      label: string,
      mutate: () => void,
    ): Promise<void> => {
      counts.base = 0;
      mutate();
      await el.updateComplete;
      expect(counts.base, `${label} must refresh the base layers`).to.be.greaterThan(0);
    };

    await expectRefresh('toggling showLabels', () => {
      el.showLabels = false;
    });
    await expectRefresh('toggling showIeds', () => {
      el.showIeds = false;
    });
    await expectRefresh('changing highlight', () => {
      el.highlight = [{ id: 'nonexistent', style: {} as Style }];
    });
    await expectRefresh('changing selectable', () => {
      el.selectable = ['Bay'];
    });
  });

  it('suppresses the placed element from the base layers', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    const bay = doc.querySelector('Bay')!;
    const bayId = String(identity(bay));

    const baseLayerBay = () =>
      Array.from(el.sld.querySelectorAll('g.bay')).filter(
        g => g.id === bayId && !g.classList.contains('preview'),
      );

    expect(baseLayerBay(), 'bay drawn in the base layer while idle').to.have.lengthOf(1);

    el.interaction = interactions.placing(bay, [0, 0]);
    await el.updateComplete;

    expect(
      baseLayerBay(),
      'placed bay removed from the base layer (drawn only as the preview ghost)',
    ).to.have.lengthOf(0);
  });
});

/**
 * The viewer's read-only contract. A bare `<sld-substation-viewer>` (no
 * `interaction` supplied) must be a truly static diagram: it defaults to the
 * `locked` interaction and paints none of the editing affordances. The editor
 * opts back in by projecting its own `idle`/gesture interaction down. These
 * tests pin that default and the affordance suppression that follows from it.
 */
describe('SldSubstationViewer read-only locked default', () => {
  it('defaults to the locked interaction when none is supplied', async () => {
    const el = await mountViewer(contractSubstationDoc());
    expect(el.interaction.mode).to.equal('locked');
  });

  it('paints no connect ports while locked, but does while idle', async () => {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc); // locked by default

    expect(
      el.sld.querySelectorAll('circle.port'),
      'no connect ports in the read-only default',
    ).to.have.lengthOf(0);

    el.interaction = interactions.idle();
    await el.updateComplete;

    expect(
      el.sld.querySelectorAll('circle.port').length,
      'ports reappear once an editor drives the viewer to idle',
    ).to.be.greaterThan(0);
  });

  it('treats locked like idle for mouse-only re-renders (no churn)', async () => {
    const el = await mountViewer(contractSubstationDoc()); // locked

    const counts = spyLayers(el);
    counts.render = 0;
    counts.base = 0;
    await bumpMouse(el);

    expect(counts.render, 'locked mouse move is dropped by shouldUpdate').to.equal(0);
    expect(counts.base, 'locked never re-runs the base layers on a mouse move').to.equal(0);
  });
});

describe('SldSubstationViewer connection routing', () => {
  // The neighbouring equipment cell; the source's own terminal stub is inside its cell.
  const obstacles = [[4, 3, 1, 1]];

  async function connectingViewer(cursor: [number, number]) {
    const doc = contractSubstationDoc();
    const el = await mountViewer(doc);
    const from = doc.querySelector('ConductingEquipment')!;
    // Leaves the lower terminal of the first equipment, heading down.
    el.interaction = interactions.connectingFrom(from, 'T2', [
      [3.5, 3.84],
      [3.5, 4],
    ]);
    [el.mouseX2, el.mouseY2] = cursor;
    await el.updateComplete;
    return el;
  }

  function previewLines(el: SldSubstationViewer) {
    return Array.from(
      el.sld.querySelectorAll('line[stroke-linecap="square"]'),
    ).filter(line => (line.parentElement as Element) === el.sld);
  }

  it('previews an orthogonal route that avoids other equipment', async () => {
    const el = await connectingViewer([6.5, 3.5]);
    const lines = previewLines(el);
    expect(lines.length).to.be.greaterThan(1);

    lines.forEach((line) => {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(a =>
        Number(line.getAttribute(a)),
      );
      expect(x1 === x2 || y1 === y2, 'segment is orthogonal').to.be.true;
      obstacles.forEach(([x, y, w, h]) => {
        const crosses =
          Math.max(x1, x2) > x &&
          Math.min(x1, x2) < x + w &&
          Math.max(y1, y2) > y &&
          Math.min(y1, y2) < y + h;
        expect(crosses, `segment ${x1},${y1} ${x2},${y2} enters equipment`).to
          .be.false;
      });
    });
  });

  it('commits the routed leg and keeps its direction on click', async () => {
    const el = await connectingViewer([6.5, 3.5]);
    const paths: Point[][] = [];
    el.addEventListener('oscd-sld-extend-connect-point', (e) => {
      paths.push((e as CustomEvent<{ path: Point[] }>).detail.path);
    });

    el.sld.querySelector<SVGRectElement>('rect[fill="url(#grid)"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    const [path] = paths;
    const last = path[path.length - 1];
    const anchor = path[path.length - 2];
    expect(anchor).to.deep.equal([6.5, 3.5]);
    expect(last[0] === anchor[0] || last[1] === anchor[1]).to.be.true;
    expect(Math.abs(last[0] - anchor[0]) + Math.abs(last[1] - anchor[1])).to.equal(
      0.5,
    );
  });

  it('shows no route and ignores clicks where the cursor cannot be reached', async () => {
    const el = await connectingViewer([4.5, 3.5]);
    expect(previewLines(el)).to.have.lengthOf(0);

    const events: Event[] = [];
    el.addEventListener('oscd-sld-extend-connect-point', e => events.push(e));
    el.addEventListener('oscd-sld-connect', e => events.push(e));
    el.sld
      .querySelector('rect[fill="url(#grid)"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(events).to.be.empty;
  });

  describe('towards an existing connectivity node', () => {
    async function viewerWithWire(cursor: [number, number]) {
      const doc = contractSubstationDoc();
      const cNode = doc.querySelector('ConnectivityNode')!;
      const priv = doc.createElementNS(cNode.namespaceURI, 'Private');
      priv.setAttribute('type', 'OpenSCD-SLD-Layout');
      const section = doc.createElementNS(SLD_NS, 'sld:Section');
      [2.5, 10.5].forEach((x) => {
        const vertex = doc.createElementNS(SLD_NS, 'sld:Vertex');
        vertex.setAttributeNS(SLD_NS, 'sld:x', `${x}`);
        vertex.setAttributeNS(SLD_NS, 'sld:y', '7.5');
        section.appendChild(vertex);
      });
      priv.appendChild(section);
      cNode.appendChild(priv);

      const el = await mountViewer(doc);
      el.interaction = interactions.connectingFrom(
        doc.querySelector('ConductingEquipment')!,
        'T2',
        [
          [3.5, 3.84],
          [3.5, 4],
        ],
      );
      [el.mouseX2, el.mouseY2] = cursor;
      await el.updateComplete;
      return { el, cNode };
    }

    function meetingPoint(el: SldSubstationViewer): Point {
      const lines = previewLines(el);
      const last = lines[lines.length - 1];
      return [Number(last.getAttribute('x2')), Number(last.getAttribute('y2'))];
    }

    it('meets the wire where the route first reaches it, wherever it is hovered', async () => {
      const near = await viewerWithWire([3.5, 7.5]);
      const far = await viewerWithWire([9.5, 7.5]);
      expect(meetingPoint(near.el)).to.deep.equal([3.5, 7.5]);
      expect(meetingPoint(far.el)).to.deep.equal([3.5, 7.5]);
    });

    it('meets a free end of the wire straight on when the cursor is on it', async () => {
      const { el } = await viewerWithWire([10.5, 7.5]);
      const lines = previewLines(el);
      const last = lines[lines.length - 1];
      expect(['x2', 'y2'].map(a => Number(last.getAttribute(a)))).to.deep.equal([
        10.5, 7.5,
      ]);
      expect(last.getAttribute('y1')).to.equal('7.5');
    });

    it('connects at that point on click', async () => {
      const { el, cNode } = await viewerWithWire([9.5, 7.5]);
      const events: CustomEvent[] = [];
      el.addEventListener('oscd-sld-connect', e => events.push(e as CustomEvent));
      el.sld
        .querySelector('rect[fill="url(#grid)"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const [{ detail }] = events;
      expect(detail.to).to.equal(cNode);
      expect(detail.path[detail.path.length - 1]).to.deep.equal([3.5, 7.5]);
    });
  });
});
