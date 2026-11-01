import { expect } from '@open-wc/testing';
import { nothing } from 'lit';

import { renderConnectivityNode } from './connectivity-node.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { sldFixture } from '../../test-helpers.js';
import { connectingFrom, locked } from '../../foundations/interaction-mode.js';

function busBarNodeDoc() {
  return sldFixture({
    vl: { x: 0, y: 0 },
    bay: { w: 4, h: 1 },
    bayName: 'BB1',
    children: `
      <ConnectivityNode name="L" pathName="S1/V1/BB1/L">
        <Private type="OpenSCD-SLD-Layout">
          <smth:Section smth:bus="true">
            <smth:Vertex smth:x="2.5" smth:y="2.5"/>
            <smth:Vertex smth:x="5.5" smth:y="2.5"/>
          </smth:Section>
        </Private>
      </ConnectivityNode>`,
  });
}

describe('renderConnectivityNode', () => {
  let doc: XMLDocument;
  let cNode: Element;
  let bay: Element;
  let substation: Element;

  beforeEach(() => {
    doc = busBarNodeDoc();
    cNode = doc.querySelector('ConnectivityNode')!;
    bay = doc.querySelector('Bay')!;
    substation = doc.querySelector('Substation')!;
  });

  it('returns nothing for a node without a layout private', () => {
    const orphan = doc.createElement('ConnectivityNode');
    const context = makeArtifactContext({ substation });
    expect(renderConnectivityNode(orphan, context)).to.equal(nothing);
  });

  it('renders a node group with section lines and the path name', () => {
    const context = makeArtifactContext({ substation });
    const host = renderToSvg(renderConnectivityNode(cNode, context));
    expect(host.querySelector('g.node')).to.not.be.null;
    expect(host.querySelector('g.node title')!.textContent).to.equal(
      'S1/V1/BB1/L',
    );
    expect(host.querySelectorAll('g.node line').length).to.be.greaterThan(0);
  });

  it('uses the node identity as id within the substation', () => {
    const context = makeArtifactContext({ substation });
    const host = renderToSvg(renderConnectivityNode(cNode, context));
    expect(host.querySelector('g.node')!.getAttribute('id')).to.not.be.empty;
  });

  describe('busbar interactions', () => {
    function interactiveLine(context = makeArtifactContext({ substation })) {
      const host = renderToSvg(renderConnectivityNode(cNode, context));
      return host.querySelectorAll('g.node line')[1];
    }

    it('starts placement of the bay on click', () => {
      const context = makeArtifactContext({ substation });
      interactiveLine(context).dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 11 }),
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-start-interaction',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.element).to.equal(bay);
      expect(event.detail.offset).to.deep.equal([8, 9]);
    });

    it('prevents default on a middle-click mousedown', () => {
      const event = new MouseEvent('mousedown', {
        button: 1,
        bubbles: true,
        cancelable: true,
      });
      interactiveLine().dispatchEvent(event);
      expect(event.defaultPrevented).to.be.true;
    });

    it('starts a bottom-right resize on middle-button auxclick near the end', () => {
      const context = makeArtifactContext({ substation });
      interactiveLine(context).dispatchEvent(
        new MouseEvent('auxclick', {
          button: 1,
          bubbles: true,
          clientX: 5,
          clientY: 2,
        }),
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-start-interaction',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.mode).to.equal('resizingBR');
      expect(event.detail.element).to.equal(bay);
    });

    it('starts a top-left resize on middle-button auxclick near the start', () => {
      const context = makeArtifactContext({ substation });
      interactiveLine(context).dispatchEvent(
        new MouseEvent('auxclick', {
          button: 1,
          bubbles: true,
          clientX: 2,
          clientY: 2,
        }),
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-start-interaction',
      ) as CustomEvent;
      expect(event.detail.mode).to.equal('resizingTL');
      expect(event.detail.element).to.equal(bay);
    });

    it('opens the context menu for the bay when idle', () => {
      const context = makeArtifactContext({ substation });
      interactiveLine(context).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true }),
      );
      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-open-context-menu',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.element).to.equal(bay);
    });

    it('does not act on a disabled node', () => {
      const context = makeArtifactContext({ disabled: true, substation });
      const line = interactiveLine(context);
      line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      line.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
      expect(context.dispatched).to.have.lengthOf(0);
    });

    it('is not pointer-interactive in the read-only locked mode', () => {
      const context = makeArtifactContext({ interaction: locked(), substation });
      const host = renderToSvg(renderConnectivityNode(cNode, context));
      host.querySelectorAll('g.node line').forEach((line) => {
        expect(line.getAttribute('pointer-events')).to.equal('none');
      });
    });
  });

  describe('connecting to the busbar', () => {
    // The fixture's bus section runs horizontally from (2.5,2.5) to (5.5,2.5).
    function connectLine(context: ReturnType<typeof makeArtifactContext>) {
      const host = renderToSvg(renderConnectivityNode(cNode, context));
      return host.querySelectorAll('g.node line')[1];
    }

    it('routes an elbow from a horizontal last segment onto the busbar', () => {
      const from = doc.createElement('ConductingEquipment');
      const context = makeArtifactContext({
        substation,
        // last committed segment (0,0)->(2.5,0) is horizontal
        interaction: connectingFrom(from, 'T2', [
          [0, 0],
          [2.5, 0],
        ]),
        mouseX2: 4,
        mouseY2: 2.5,
      });

      connectLine(context).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-connect',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      expect(event.detail.from).to.equal(from);
      expect(event.detail.fromTerminal).to.equal('T2');
      expect(event.detail.to).to.equal(cNode);
      // horizontal last segment -> bend down at the cursor x=4, land on the bus
      expect(event.detail.path).to.deep.equal([
        [0, 0],
        [4, 0],
        [4, 2.5],
      ]);
    });

    it('routes an elbow from a vertical last segment onto the nearest vertex', () => {
      const from = doc.createElement('ConductingEquipment');
      const context = makeArtifactContext({
        substation,
        // last committed segment (0,0)->(0,2) is vertical
        interaction: connectingFrom(from, 'T1', [
          [0, 0],
          [0, 2],
        ]),
        mouseX2: 4,
        mouseY2: 2.5,
      });

      connectLine(context).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      const event = context.dispatched.find(
        e => e.type === 'oscd-sld-connect',
      ) as CustomEvent;
      expect(event).to.not.be.undefined;
      // vertical last segment -> travel across at y=2.5, clamp to the bus start
      expect(event.detail.path).to.deep.equal([
        [0, 0],
        [0, 2.5],
        [2.5, 2.5],
      ]);
    });

    it('ignores a click from equipment already connected to the node', () => {
      const from = doc.createElement('ConductingEquipment');
      const terminal = doc.createElement('Terminal');
      terminal.setAttribute('connectivityNode', 'S1/V1/BB1/L');
      from.appendChild(terminal);
      const context = makeArtifactContext({
        substation,
        interaction: connectingFrom(from, 'T2', [
          [0, 0],
          [2.5, 0],
        ]),
        mouseX2: 4,
        mouseY2: 2.5,
      });

      connectLine(context).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      expect(
        context.dispatched.find(e => e.type === 'oscd-sld-connect'),
      ).to.be.undefined;
    });
  });
});
