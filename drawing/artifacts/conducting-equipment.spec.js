import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';
import { conductingEquipmentArtifact } from './conducting-equipment.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { locked, placing } from '../../foundations/interaction-mode.js';
import { sldFixture } from '../../test-helpers.js';
function equipmentDoc() {
    return sldFixture({
        children: `
      <ConductingEquipment name="QA1" type="CBR">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="3" smth:y="3"/>
        </Private>
      </ConductingEquipment>`,
    });
}
describe('conductingEquipmentArtifact', () => {
    let doc;
    let equipment;
    let substation;
    let bay;
    beforeEach(() => {
        doc = equipmentDoc();
        equipment = doc.querySelector('ConductingEquipment');
        substation = doc.querySelector('Substation');
        bay = doc.querySelector('Bay');
    });
    describe('matches', () => {
        it('matches a ConductingEquipment element', () => {
            expect(conductingEquipmentArtifact.matches(equipment)).to.be.true;
        });
        it('does not match other elements', () => {
            expect(conductingEquipmentArtifact.matches(bay)).to.be.false;
        });
    });
    describe('state', () => {
        it('is undefined while placing itself without preview', () => {
            const context = makeArtifactContext({ interaction: placing(equipment, [0, 0]), substation });
            expect(conductingEquipmentArtifact.state(equipment, context)).to.be
                .undefined;
        });
        it('derives position, ports and flags for a terminal-less device', () => {
            const context = makeArtifactContext({ substation });
            const state = conductingEquipmentArtifact.state(equipment, context);
            expect(state.position).to.deep.equal([3, 3]);
            expect(state.canShowTopPort).to.be.true;
            expect(state.canShowBottomPort).to.be.true;
            expect(state.placingSelf).to.be.false;
            expect(state.diagramElementId).to.equal(`${identity(equipment)}`);
        });
        it('marks placingSelf when previewing the placed device', () => {
            const context = makeArtifactContext({ interaction: placing(equipment, [0, 0]), substation });
            const state = conductingEquipmentArtifact.state(equipment, context, {
                preview: true,
            });
            expect(state.placingSelf).to.be.true;
        });
        it('hides the connect ports in the read-only locked mode', () => {
            const context = makeArtifactContext({ interaction: locked(), substation });
            const state = conductingEquipmentArtifact.state(equipment, context);
            expect(state.canShowTopPort).to.be.false;
            expect(state.canShowBottomPort).to.be.false;
        });
    });
    describe('actions', () => {
        function actionsFor(context = makeArtifactContext({ substation })) {
            const state = conductingEquipmentArtifact.state(equipment, context, {
                preview: true,
            });
            return conductingEquipmentArtifact.actions(equipment, context, state);
        }
        it('starts placement of the device on plain click', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onClick(new MouseEvent('click'));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(equipment);
        });
        it('requests a copy on shift-click', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onClick(new MouseEvent('click', { shiftKey: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(equipment);
            expect(event.detail.copy).to.be.true;
        });
        it('places into the containing bay while placing itself', () => {
            const context = makeArtifactContext({ interaction: placing(equipment, [0, 0]), substation });
            actionsFor(context).onClick(new MouseEvent('click'));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-place');
            expect(event).to.not.be.undefined;
            expect(event.detail.parent).to.equal(bay);
        });
        it('rotates on middle-button auxclick', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onAuxClick(new MouseEvent('auxclick', { button: 1 }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-rotate');
            expect(event).to.not.be.undefined;
            expect(event.detail).to.equal(equipment);
        });
        it('grounds terminals through the context callback', () => {
            const context = makeArtifactContext({ substation });
            const actions = actionsFor(context);
            actions.onGroundTop(new MouseEvent('contextmenu'));
            actions.onGroundBottom(new MouseEvent('contextmenu'));
            expect(context.grounded).to.deep.equal([
                { element: equipment, terminal: 'T1' },
                { element: equipment, terminal: 'T2' },
            ]);
        });
        it('starts a connection from a terminal', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onStartTopConnect();
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.from).to.equal(equipment);
            expect(event.detail.fromTerminal).to.equal('T1');
        });
    });
    describe('render', () => {
        it('renders an equipment group with connection ports', () => {
            const context = makeArtifactContext({ substation });
            const state = conductingEquipmentArtifact.state(equipment, context);
            const actions = conductingEquipmentArtifact.actions(equipment, context, state);
            const host = renderToSvg(conductingEquipmentArtifact.render(equipment, state, actions, context));
            expect(host.querySelector('g.equipment')).to.not.be.null;
            expect(host.querySelectorAll('circle.port')).to.have.lengthOf(2);
        });
    });
});
//# sourceMappingURL=conducting-equipment.spec.js.map