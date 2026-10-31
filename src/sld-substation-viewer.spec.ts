import { fixture, html, expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';

import { SldSubstationViewer } from './sld-substation-viewer.js';
import * as interactions from './foundations/interaction-mode.js';
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

describe('SldSubstationViewer connecting to a transformer winding', () => {
  async function connectingViewer() {
    const doc = contractSubstationDoc();
    const bay = doc.querySelector('Bay')!;
    const transformer = new DOMParser().parseFromString(
      `<PowerTransformer xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:sld="${SLD_NS}" name="T1">` +
        `<Private type="OpenSCD-SLD-Layout"><sld:SLDAttributes sld:x="3" sld:y="5"/></Private>` +
        `<TransformerWinding name="W1"/></PowerTransformer>`,
      'application/xml',
    ).documentElement;
    bay.appendChild(doc.importNode(transformer, true));

    const from = doc.querySelectorAll('ConductingEquipment')[1];
    const el = await mountViewer(doc);
    el.interaction = interactions.connectingFrom(from, 'T2', [
      [4.5, 3.84],
      [4.5, 4],
    ]);
    await el.updateComplete;
    return { el, from, winding: doc.querySelector('TransformerWinding')! };
  }

  async function hover(el: SldSubstationViewer, x: number, y: number) {
    Object.assign(el, {
      mouseX: Math.floor(x),
      mouseY: Math.floor(y),
      mouseX2: x,
      mouseY2: y,
    });
    await el.updateComplete;
  }

  function clickDropTarget(el: SldSubstationViewer) {
    const events: CustomEvent[] = [];
    el.addEventListener('oscd-sld-connect', e => events.push(e as CustomEvent));
    el.sld
      .querySelector('rect[fill="url(#grid)"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return events;
  }

  it('connects to a winding terminal under the cursor', async () => {
    const { el, from, winding } = await connectingViewer();
    await hover(el, 3.5, 4.5);

    const [event] = clickDropTarget(el);
    expect(event.detail.from).to.equal(from);
    expect(event.detail.to).to.equal(winding);
    expect(event.detail.toTerminal).to.equal('T1');
    expect(event.detail.path.at(-1)).to.deep.equal([3.5, 4.3]);
  });

  it('shows connect indicators on open winding terminals', async () => {
    const { el } = await connectingViewer();
    expect(
      el.sld.querySelectorAll('polygon.connect-indicator').length,
    ).to.be.greaterThan(0);
  });

  it('does not snap to winding terminals when connecting from a winding', async () => {
    const { el, winding } = await connectingViewer();
    el.interaction = interactions.connectingFrom(winding, 'N1', [
      [3.5, 5.5],
      [3.5, 6],
    ]);
    await hover(el, 3.5, 4.5);
    expect(clickDropTarget(el)).to.have.lengthOf(0);
  });

  it('does not connect when no winding terminal is near the cursor', async () => {
    const { el } = await connectingViewer();
    await hover(el, 10, 10);
    expect(clickDropTarget(el)).to.have.lengthOf(0);
  });
});
