import { expect } from '@open-wc/testing';
import { sldNs } from '../../foundations.js';
import { iedReferenceArtifact } from './ied-reference.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { placing } from '../../foundations/interaction-mode.js';
import { createSCLDoc } from '../../test-helpers.js';
function iedReferenceDoc() {
    return createSCLDoc(`
    <Substation name="S1">
      <Private type="OpenSCD-SLD-Layout">
        <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
        <smth:Reference smth:type="IED" smth:id="IED1" smth:iedName="IED1">
          <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="1" smth:h="1"/>
        </smth:Reference>
      </Private>
    </Substation>
    <IED name="IED1"/>
  `);
}
describe('iedReferenceArtifact', () => {
    let doc;
    let reference;
    let substation;
    beforeEach(() => {
        doc = iedReferenceDoc();
        reference = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
        substation = doc.querySelector('Substation');
    });
    describe('matches', () => {
        it('matches an SLD IED reference', () => {
            expect(iedReferenceArtifact.matches(reference)).to.be.true;
        });
        it('does not match a plain element', () => {
            expect(iedReferenceArtifact.matches(substation)).to.be.false;
        });
    });
    describe('state', () => {
        it('is undefined when IEDs are hidden', () => {
            const context = makeArtifactContext({
                substation,
                view: { showLabels: true, showIeds: false },
            });
            expect(iedReferenceArtifact.state(reference, context)).to.be.undefined;
        });
        it('is undefined while placing itself without preview', () => {
            const context = makeArtifactContext({ interaction: placing(reference, [0, 0]), substation });
            expect(iedReferenceArtifact.state(reference, context)).to.be.undefined;
        });
        it('resolves the referenced IED name, position and diagram id', () => {
            const context = makeArtifactContext({ substation });
            const state = iedReferenceArtifact.state(reference, context);
            expect(state.position).to.deep.equal([5, 5]);
            expect(state.iedName).to.equal('IED1');
            expect(state.diagramElementId).to.equal('IEDRef-IED1');
            expect(state.placingSelf).to.be.false;
        });
        it('marks placingSelf while previewing the placed reference', () => {
            const context = makeArtifactContext({ interaction: placing(reference, [0, 0]), substation });
            const state = iedReferenceArtifact.state(reference, context, {
                preview: true,
            });
            expect(state.placingSelf).to.be.true;
        });
    });
    describe('actions', () => {
        function actionsFor(context = makeArtifactContext({ substation })) {
            const state = iedReferenceArtifact.state(reference, context, {
                preview: true,
            });
            return iedReferenceArtifact.actions(reference, context, state);
        }
        it('starts placement on click when idle', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onClick(new MouseEvent('click'));
            expect(context.dispatched.map(e => e.type)).to.include('oscd-sld-start-interaction');
        });
        it('places into the substation while placing itself', () => {
            const context = makeArtifactContext({ interaction: placing(reference, [0, 0]), substation });
            actionsFor(context).onClick(new MouseEvent('click'));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-place');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(reference);
            expect(event.detail.parent).to.equal(substation);
        });
        it('opens the context menu when idle', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onContextMenu(new MouseEvent('contextmenu'));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-open-context-menu');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(reference);
        });
        it('does not open the context menu when not idle', () => {
            const context = makeArtifactContext({ interaction: placing(reference, [0, 0]), substation });
            actionsFor(context).onContextMenu(new MouseEvent('contextmenu'));
            expect(context.dispatched.some(e => e.type === 'oscd-sld-open-context-menu')).to.equal(false);
        });
        it('selects on click when disabled and selectable', () => {
            const context = makeArtifactContext({ disabled: true, substation });
            const state = iedReferenceArtifact.state(reference, context, {
                preview: true,
            });
            const actions = iedReferenceArtifact.actions(reference, context, {
                ...state,
                selectable: true,
            });
            actions.onClick(new MouseEvent('click'));
            expect(context.dispatched.map(e => e.type)).to.include('oscd-sld-selected');
        });
        it('prevents default on a middle-click mousedown', () => {
            const event = new MouseEvent('mousedown', {
                button: 1,
                cancelable: true,
            });
            actionsFor().onMouseDown(event);
            expect(event.defaultPrevented).to.be.true;
        });
    });
    describe('render', () => {
        it('renders an ied group referencing the IED symbol', () => {
            const context = makeArtifactContext({ substation });
            const state = iedReferenceArtifact.state(reference, context);
            const actions = iedReferenceArtifact.actions(reference, context, state);
            const host = renderToSvg(iedReferenceArtifact.render(reference, state, actions, context));
            expect(host.querySelector('g.ied')).to.not.be.null;
            expect(host.querySelector('g.ied use')).to.not.be.null;
        });
    });
});
//# sourceMappingURL=ied-reference.spec.js.map