import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';

import { powerTransformerArtifact } from './power-transformer.js';
import { windingTerminalTargets } from '../../foundations/transformer.js';
import {
  makeArtifactContext,
  renderToSvg,
} from './test-context.js';
import { connectingFrom, placing } from '../../foundations/interaction-mode.js';
import { sldFixture } from '../../test-helpers.js';

function transformerDoc() {
  return sldFixture({
    children: `
      <PowerTransformer name="T1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="4" smth:y="4"/>
        </Private>
        <TransformerWinding name="W1"/>
        <TransformerWinding name="W2"/>
      </PowerTransformer>`,
  });
}

describe('powerTransformerArtifact', () => {
  let doc: XMLDocument;
  let transformer: Element;
  let substation: Element;

  beforeEach(() => {
    doc = transformerDoc();
    transformer = doc.querySelector('PowerTransformer')!;
    substation = doc.querySelector('Substation')!;
  });

  describe('matches', () => {
    it('matches a PowerTransformer element', () => {
      expect(powerTransformerArtifact.matches(transformer)).to.be.true;
    });

    it('does not match other elements', () => {
      expect(powerTransformerArtifact.matches(substation)).to.be.false;
    });
  });

  describe('state', () => {
    it('is undefined while placing itself without preview', () => {
      const context = makeArtifactContext({ interaction: placing(transformer, [0, 0]), substation });
      expect(powerTransformerArtifact.state(transformer, context)).to.be
        .undefined;
    });

    it('derives position, windings and flags', () => {
      const context = makeArtifactContext({ substation });
      const state = powerTransformerArtifact.state(transformer, context)!;
      expect(state.position).to.deep.equal([4, 4]);
      expect(state.windings).to.have.lengthOf(2);
      expect(state.placingSelf).to.be.false;
      expect(state.disabled).to.be.false;
      expect(state.highlight).to.equal('');
    });

    it('marks placingSelf when previewing the placed transformer', () => {
      const context = makeArtifactContext({ interaction: placing(transformer, [0, 0]), substation });
      const state = powerTransformerArtifact.state(transformer, context, {
        preview: true,
      })!;
      expect(state.placingSelf).to.be.true;
    });

    it('reflects selectable and disabled context', () => {
      const context = makeArtifactContext({
        disabled: true,
        selectable: [`${identity(transformer)}`],
        substation,
      });
      const state = powerTransformerArtifact.state(transformer, context)!;
      expect(state.selectable).to.be.true;
      expect(state.disabled).to.be.true;
    });

    it('provides a highlight template when highlighted', () => {
      const context = makeArtifactContext({
        highlight: [{ id: `${identity(transformer)}`, style: { fill: 'red' } }],
        substation,
      });
      const state = powerTransformerArtifact.state(transformer, context)!;
      expect(state.highlight).to.not.equal('');
    });
  });

  describe('actions', () => {
    function actionsFor(context = makeArtifactContext({ substation })) {
      const state = powerTransformerArtifact.state(transformer, context, {
        preview: true,
      })!;
      return powerTransformerArtifact.actions(transformer, context, state);
    }

    it('starts placement on click when idle', () => {
      const context = makeArtifactContext({ substation });
      (actionsFor(context).onClick as (e: MouseEvent) => void)(
        new MouseEvent('click', { clientX: 10, clientY: 11 }),
      );
      expect(context.dispatched.map(e => e.type)).to.include(
        'oscd-sld-start-interaction',
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-start-interaction',
      ) as CustomEvent;
      expect(event.detail.element).to.equal(transformer);
      expect(event.detail.offset).to.deep.equal([6, 7]);
    });

    it('places into the containing bay when placing itself', () => {
      const context = makeArtifactContext({
        interaction: placing(transformer, [0, 0]),
        substation,
      });
      (actionsFor(context).onClick as (e: MouseEvent) => void)(
        new MouseEvent('click'),
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-place',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.element).to.equal(transformer);
      expect(event.detail.parent).to.equal(doc.querySelector('Bay'));
    });

    it('selects when disabled and selectable', () => {
      const context = makeArtifactContext({
        disabled: true,
        selectable: [`${identity(transformer)}`],
        substation,
      });
      (actionsFor(context).onClick as (e: MouseEvent) => void)(
        new MouseEvent('click'),
      );
      expect(context.dispatched.map(e => e.type)).to.deep.equal([
        'oscd-sld-selected',
      ]);
    });

    it('rotates on middle-button auxclick', () => {
      const context = makeArtifactContext({ substation });
      actionsFor(context).onAuxClick(new MouseEvent('auxclick', { button: 1 }));
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-rotate',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail).to.equal(transformer);
    });

    it('ignores non-middle auxclick', () => {
      const context = makeArtifactContext({ substation });
      actionsFor(context).onAuxClick(new MouseEvent('auxclick', { button: 0 }));
      expect(context.dispatched).to.have.lengthOf(0);
    });
  });

  describe('render', () => {
    function renderTransformer(context = makeArtifactContext({ substation })) {
      const state = powerTransformerArtifact.state(transformer, context)!;
      const actions = powerTransformerArtifact.actions(
        transformer,
        context,
        state,
      );
      return renderToSvg(
        powerTransformerArtifact.render(
          transformer,
          state,
          actions,
          context,
        ),
      );
    }

    it('renders a transformer group with a winding per child', () => {
      const host = renderTransformer();
      expect(host.querySelector('g.transformer')).to.not.be.null;
      expect(host.querySelectorAll('g.winding')).to.have.lengthOf(2);
      expect(host.querySelector('g.winding circle')).to.not.be.null;
    });

    it('renders the preview label group when previewing', () => {
      const context = makeArtifactContext({ substation });
      const state = powerTransformerArtifact.state(transformer, context, {
        preview: true,
      })!;
      const actions = powerTransformerArtifact.actions(
        transformer,
        context,
        state,
      );
      const host = renderToSvg(
        powerTransformerArtifact.render(transformer, state, actions, context, {
          preview: true,
        }),
      );
      expect(host.querySelector('g.preview')).to.not.be.null;
    });
  });

  describe('winding rendering', () => {
    function renderWinding(
      children: string,
      overrides: Parameters<typeof makeArtifactContext>[0] = {},
    ) {
      const localDoc = sldFixture({ children });
      const pt = localDoc.querySelector('PowerTransformer')!;
      const context = makeArtifactContext({
        substation: localDoc.querySelector('Substation')!,
        ...overrides,
      });
      const state = powerTransformerArtifact.state(pt, context)!;
      const actions = powerTransformerArtifact.actions(pt, context, state);
      return {
        host: renderToSvg(
          powerTransformerArtifact.render(pt, state, actions, context),
        ),
        context,
        transformer: pt,
      };
    }

    const earthingSingle = (extra = '', kindOverride = 'earthing') => `
      <PowerTransformer name="T1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="4" smth:y="4" smth:kind="${kindOverride}"/>
        </Private>
        <TransformerWinding name="W1">${extra}</TransformerWinding>
      </PowerTransformer>`;

    it('renders connect ports whose click starts a connecting interaction', () => {
      const { host, context } = renderWinding(earthingSingle());
      const port = host.querySelector('circle.port')!;
      expect(port).to.not.be.null;
      port.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-start-interaction',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.mode).to.equal('connecting');
    });

    it('grounds a neutral terminal on port right-click', () => {
      const { host, context } = renderWinding(earthingSingle());
      // the neutral (N) port is the groundable one
      const ports = Array.from(host.querySelectorAll('circle.port'));
      ports.forEach(p =>
        p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
      );
      expect(context.grounded.length).to.be.greaterThan(0);
      expect(context.grounded[0].terminal).to.match(/^N/);
    });

    it('renders a grounded-neutral marker line', () => {
      const { host } = renderWinding(
        earthingSingle('<NeutralPoint name="N1" cNodeName="grounded"/>'),
      );
      expect(host.querySelector('line[marker-start="url(#grounded)"]')).to.not
        .be.null;
    });

    it('renders the zig-zag earthing symbol', () => {
      const { host } = renderWinding(earthingSingle());
      expect(host.querySelector('g[transform*="rotate"]')).to.not.be.null;
    });

    it('renders an LTC arrow when the winding has a TapChanger', () => {
      const { host } = renderWinding(
        earthingSingle('<TapChanger name="LTC" type="LTC"/>'),
      );
      expect(host.querySelector('line[marker-end="url(#arrow)"]')).to.not.be
        .null;
    });

    it('opens the context menu on winding right-click', () => {
      const { host, context } = renderWinding(earthingSingle());
      host
        .querySelector('g.winding')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(
        context.dispatched.some(e => e.type === 'oscd-sld-open-context-menu'),
      ).to.be.true;
    });

    it('hides connect ports while disabled', () => {
      const { host } = renderWinding(earthingSingle(), { disabled: true });
      expect(host.querySelector('circle.port')).to.be.null;
    });
  });

  describe('connect mode', () => {
    let from: Element;
    let target: Element;
    let targetSubstation: Element;

    beforeEach(() => {
      const localDoc = sldFixture({
        children: `
          <ConductingEquipment name="Q1" type="CBR"/>
          <PowerTransformer name="T1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="4" smth:y="4"/>
            </Private>
            <TransformerWinding name="W1"/>
            <TransformerWinding name="W2"/>
          </PowerTransformer>`,
      });
      from = localDoc.querySelector('ConductingEquipment')!;
      target = localDoc.querySelector('PowerTransformer')!;
      targetSubstation = localDoc.querySelector('Substation')!;
    });

    function renderConnect(
      overrides: Parameters<typeof makeArtifactContext>[0] = {},
      fromElement = from,
    ) {
      const context = makeArtifactContext({
        interaction: connectingFrom(fromElement, 'T1', [[1, 1]]),
        substation: targetSubstation,
        ...overrides,
      });
      const state = powerTransformerArtifact.state(target, context, {
        connect: true,
      })!;
      const actions = powerTransformerArtifact.actions(target, context, state);
      return renderToSvg(
        powerTransformerArtifact.render(target, state, actions, context, {
          connect: true,
        }),
      );
    }

    it('is suppressed in the base layer while connecting', () => {
      const context = makeArtifactContext({
        interaction: connectingFrom(from, 'T1', [[1, 1]]),
        substation: targetSubstation,
      });
      expect(powerTransformerArtifact.state(target, context)).to.be.undefined;
    });

    it('lets clicks through to the connection drop-target', () => {
      const host = renderConnect();
      expect(
        host.querySelector('g.transformer')!.getAttribute('pointer-events'),
      ).to.equal('none');
    });

    it('shows an indicator on every open winding terminal', () => {
      const host = renderConnect();
      expect(host.querySelectorAll('polygon.connect-indicator')).to.have.lengthOf(
        windingTerminalTargets(
          target.querySelectorAll('TransformerWinding')[0],
          [4, 4],
          { rot: 0, kind: 'default', flip: false },
        ).length +
          windingTerminalTargets(
            target.querySelectorAll('TransformerWinding')[1],
            [4, 4],
            { rot: 0, kind: 'default', flip: false },
          ).length,
      );
      expect(host.querySelector('circle.port')).to.be.null;
    });

    it('hides the indicator of the terminal being targeted', () => {
      const winding = target.querySelectorAll('TransformerWinding')[0];
      const [first] = windingTerminalTargets(winding, [4, 4], {
        rot: 0,
        kind: 'default',
        flip: false,
      });
      const all = renderConnect().querySelectorAll('polygon.connect-indicator');
      const withTarget = renderConnect({
        connectTarget: {
          to: winding,
          toTerminal: first.terminal,
          near: first.near,
          far: first.far,
        },
      }).querySelectorAll('polygon.connect-indicator');
      expect(withTarget).to.have.lengthOf(all.length - 1);
    });

    it('shows no indicators when connecting from a winding', () => {
      const winding = target.querySelectorAll('TransformerWinding')[0];
      expect(
        renderConnect({}, winding).querySelectorAll('polygon.connect-indicator'),
      ).to.have.lengthOf(0);
    });
  });

  describe('highlight winding counts', () => {
    function highlightHost(children: string): SVGSVGElement {
      const localDoc = sldFixture({ children });
      const pt = localDoc.querySelector('PowerTransformer')!;
      const context = makeArtifactContext({
        substation: localDoc.querySelector('Substation')!,
        highlight: [{ id: `${identity(pt)}`, style: { fill: 'red' } }],
      });
      const state = powerTransformerArtifact.state(pt, context)!;
      const actions = powerTransformerArtifact.actions(pt, context, state);
      return renderToSvg(
        powerTransformerArtifact.render(pt, state, actions, context),
      );
    }

    it('highlights a single-winding transformer', () => {
      const host = highlightHost(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="4" smth:y="4"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>`);
      expect(host.querySelector('rect[pointer-events="none"]')).to.not.be.null;
    });

    it('highlights a three-winding transformer', () => {
      const host = highlightHost(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="4" smth:y="4"/>
          </Private>
          <TransformerWinding name="W1"/>
          <TransformerWinding name="W2"/>
          <TransformerWinding name="W3"/>
        </PowerTransformer>`);
      expect(host.querySelector('rect[pointer-events="none"]')).to.not.be.null;
    });
  });

  describe('interaction edge cases', () => {
    function renderFull(
      context = makeArtifactContext({ substation }),
      options: { preview?: boolean } = {},
    ) {
      const state = powerTransformerArtifact.state(transformer, context, options)!;
      const actions = powerTransformerArtifact.actions(
        transformer,
        context,
        state,
      );
      return renderToSvg(
        powerTransformerArtifact.render(
          transformer,
          state,
          actions,
          context,
          options,
        ),
      );
    }

    it('prevents default on a middle-click mousedown', () => {
      const host = renderFull();
      const event = new MouseEvent('mousedown', {
        button: 1,
        bubbles: true,
        cancelable: true,
      });
      host.querySelector('g.transformer')!.dispatchEvent(event);
      expect(event.defaultPrevented).to.be.true;
    });

    it('ignores a T terminal port right-click', () => {
      const context = makeArtifactContext({ substation });
      const state = powerTransformerArtifact.state(transformer, context)!;
      const actions = powerTransformerArtifact.actions(
        transformer,
        context,
        state,
      );
      const host = renderToSvg(
        powerTransformerArtifact.render(transformer, state, actions, context),
      );
      const terminalPorts = Array.from(
        host.querySelectorAll('circle.port'),
      ).filter(p =>
        (p.getAttribute('style') ?? '').includes('--oscd-sld-terminal-color)'),
      );
      expect(terminalPorts.length, 'a terminal port should render').to.be.above(
        0,
      );
      terminalPorts.forEach(port =>
        port.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })),
      );
      // right-clicking a T terminal must never ground it
      expect(context.grounded).to.have.lengthOf(0);
    });

    it('ignores a port click while an interaction is in progress', () => {
      const context = makeArtifactContext({
        interaction: placing(transformer, [0, 0]),
        substation,
      });
      const host = renderFull(context, { preview: true });
      host
        .querySelector('circle.port')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(
        context.dispatched.some(e => e.type === 'oscd-sld-start-interaction'),
      ).to.be.false;
    });

    it('ignores a winding right-click while an interaction is in progress', () => {
      const context = makeArtifactContext({
        interaction: placing(transformer, [0, 0]),
        substation,
      });
      const host = renderFull(context, { preview: true });
      host
        .querySelector('g.winding')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(
        context.dispatched.some(e => e.type === 'oscd-sld-open-context-menu'),
      ).to.be.false;
    });

    it('renders the placement click target while placing itself', () => {
      const context = makeArtifactContext({
        interaction: placing(transformer, [0, 0]),
        substation,
        mouseX: 5,
        mouseY: 6,
      });
      const host = renderFull(context, { preview: true });
      expect(
        host.querySelector('g.transformer > rect[fill="none"]'),
      ).to.not.be.null;
    });
  });
});
