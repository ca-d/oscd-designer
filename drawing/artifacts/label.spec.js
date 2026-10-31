import { expect } from '@open-wc/testing';
import { nothing } from 'lit';
import { identity } from '@openscd/scl-lib';
import { renderLabel } from './label.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { createSCLDoc, sldFixture } from '../../test-helpers.js';
import { sldNs } from '../../foundations.js';
import { placing } from '../../foundations/interaction-mode.js';
function labelDoc() {
    return sldFixture({
        children: `
      <ConductingEquipment name="QA1" type="CBR">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="3" smth:y="3"/>
        </Private>
        <Text>Hello</Text>
      </ConductingEquipment>`,
    });
}
describe('renderLabel', () => {
    let doc;
    let equipment;
    let text;
    let substation;
    beforeEach(() => {
        doc = labelDoc();
        equipment = doc.querySelector('ConductingEquipment');
        text = doc.querySelector('Text');
        substation = doc.querySelector('Substation');
    });
    it('returns nothing when labels are hidden', () => {
        const context = makeArtifactContext({
            substation,
            view: { showLabels: false, showIeds: true },
        });
        expect(renderLabel(equipment, context)).to.equal(nothing);
    });
    it('renders the element name as label text', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(equipment, context));
        const label = host.querySelector('g.label text');
        expect(label).to.not.be.null;
        expect(label.textContent).to.contain('QA1');
    });
    it('renders Text element content as tspans', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(text, context));
        expect(host.querySelector('g.label tspan')).to.not.be.null;
    });
    it('starts label placement on click when idle', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(equipment, context));
        host
            .querySelector('g.label text')
            .dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 11 }));
        const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
        expect(event).to.not.be.undefined;
        expect(event.detail.element).to.equal(equipment);
        expect(event.detail.offset).to.deep.equal([9.5, 11.5]);
    });
    it('selects on click when disabled and selectable', () => {
        const context = makeArtifactContext({
            disabled: true,
            selectable: [`${identity(equipment)}`],
            substation,
        });
        const host = renderToSvg(renderLabel(equipment, context));
        host
            .querySelector('g.label text')
            .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(context.dispatched.map(e => e.type)).to.include('oscd-sld-selected');
    });
    it('opens an edit dialog on middle-click of a Text label', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(text, context));
        host
            .querySelector('g.label text')
            .dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }));
        expect(context.dispatched.map(e => e.type)).to.include('oscd-sld-edit-scl');
    });
    it('prevents default on a middle-click mousedown', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(equipment, context));
        const event = new MouseEvent('mousedown', {
            button: 1,
            bubbles: true,
            cancelable: true,
        });
        host.querySelector('g.label text').dispatchEvent(event);
        expect(event.defaultPrevented).to.be.true;
    });
    it('renders a placeholder for empty Text labels', () => {
        doc = sldFixture({
            children: `
        <ConductingEquipment name="QA1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3"/>
          </Private>
          <Text></Text>
        </ConductingEquipment>`,
        });
        const emptyText = doc.querySelector('Text');
        const context = makeArtifactContext({
            substation: doc.querySelector('Substation'),
        });
        const host = renderToSvg(renderLabel(emptyText, context));
        expect(host.querySelector('g.label text').textContent).to.contain('Middle click to edit');
    });
    it('opens the context menu on right-click when idle', () => {
        const context = makeArtifactContext({ substation });
        const host = renderToSvg(renderLabel(equipment, context));
        host
            .querySelector('g.label text')
            .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        expect(context.dispatched.map(e => e.type)).to.include('oscd-sld-open-context-menu');
    });
    it('does not open the context menu on right-click when not idle', () => {
        const context = makeArtifactContext({
            substation,
            interaction: placing(equipment, [0, 0]),
        });
        const host = renderToSvg(renderLabel(equipment, context));
        host
            .querySelector('g.label text')
            .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        expect(context.dispatched.map(e => e.type)).to.not.include('oscd-sld-open-context-menu');
    });
    it('returns nothing for an IED reference when IEDs are hidden', () => {
        const iedDoc = createSCLDoc(`
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
        const reference = iedDoc.getElementsByTagNameNS(sldNs, 'Reference')[0];
        const context = makeArtifactContext({
            substation: iedDoc.querySelector('Substation'),
            view: { showLabels: true, showIeds: false },
        });
        expect(renderLabel(reference, context)).to.equal(nothing);
    });
    it('renders an unresolved IED reference label when the IED is missing', () => {
        const iedDoc = createSCLDoc(`
      <Substation name="S1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
          <smth:Reference smth:type="IED" smth:id="MISSING" smth:iedName="MISSING">
            <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="1" smth:h="1"/>
          </smth:Reference>
        </Private>
      </Substation>
    `);
        const reference = iedDoc.getElementsByTagNameNS(sldNs, 'Reference')[0];
        const context = makeArtifactContext({
            substation: iedDoc.querySelector('Substation'),
        });
        const host = renderToSvg(renderLabel(reference, context));
        const label = host.querySelector('g.label text');
        expect(label).to.not.be.null;
        expect(label.getAttribute('style')).to.contain('unresolved-reference-color');
    });
});
//# sourceMappingURL=label.spec.js.map