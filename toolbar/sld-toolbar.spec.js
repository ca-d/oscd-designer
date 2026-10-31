import { html } from 'lit';
import { fixture, expect } from '@open-wc/testing';
import { spy } from 'sinon';
import { SldToolbar } from './sld-toolbar.js';
if (!customElements.get('sld-toolbar')) {
    customElements.define('sld-toolbar', SldToolbar);
}
const emptyDocString = `<?xml version="1.0" encoding="UTF-8"?>
<SCL version="2007" revision="B" xmlns="http://www.iec.ch/61850/2003/SCL" xmlns:eosld="https://openscd.org/SCL/SSD/SLD/v0">
</SCL>`;
const substationDocString = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" xmlns:eosld="https://openscd.org/SCL/SSD/SLD/v0">
  <IED name="IED1" manufacturer="Dummy" />
  <Substation name="S1">
    <Private type="OpenSCD-SLD-Layout">
      <eosld:SLDAttributes eosld:w="50" eosld:h="25" />
    </Private>
    <VoltageLevel name="V1">
      <Private type="OpenSCD-SLD-Layout">
        <eosld:SLDAttributes eosld:x="1" eosld:y="1" eosld:w="13" eosld:h="13" />
      </Private>
      <Bay name="B1">
        <Private type="OpenSCD-SLD-Layout">
          <eosld:SLDAttributes eosld:x="2" eosld:y="2" eosld:w="6" eosld:h="6" />
        </Private>
      </Bay>
    </VoltageLevel>
  </Substation>
</SCL>`;
function makeTemplateElements(doc) {
    const sclNs = 'http://www.iec.ch/61850/2003/SCL';
    const templates = {};
    for (const tag of [
        'Bay',
        'ConductingEquipment',
        'PowerTransformer',
        'TransformerWinding',
        'VoltageLevel',
    ]) {
        templates[tag] = doc.createElementNS(sclNs, tag);
    }
    const busBar = doc.createElementNS(sclNs, 'Bay');
    busBar.setAttribute('name', 'BB1');
    const cn = doc.createElementNS(sclNs, 'ConnectivityNode');
    cn.setAttribute('name', 'L');
    busBar.appendChild(cn);
    templates.BusBar = busBar;
    return templates;
}
function queryToolbar(toolbar, selector) {
    return toolbar.shadowRoot.querySelector(selector);
}
function clickInteractive(el) {
    const target = el.shadowRoot?.querySelector('#button, #item') ?? el;
    target.click();
}
describe('SldToolbar', () => {
    describe('substation management', () => {
        let toolbar;
        let editSpy;
        beforeEach(async () => {
            const doc = new DOMParser().parseFromString(emptyDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            editSpy = spy();
            toolbar.addEventListener('oscd-edit-v2', editSpy);
        });
        it('dispatches an edit to insert a substation', () => {
            const fab = queryToolbar(toolbar, '[title="Add Substation"]');
            clickInteractive(fab);
            expect(editSpy.calledOnce).to.be.true;
            const edit = editSpy.firstCall.args[0].detail.edit;
            expect(edit.node.tagName).to.equal('Substation');
            expect(edit.node.getAttribute('name')).to.equal('S1');
        });
        it('generates unique substation names', () => {
            const fab = queryToolbar(toolbar, '[title="Add Substation"]');
            clickInteractive(fab);
            // Apply the first edit to the doc so the toolbar sees an existing S1
            const firstNode = editSpy.firstCall.args[0].detail.edit.node;
            toolbar.doc.documentElement.appendChild(firstNode);
            clickInteractive(fab);
            expect(editSpy.calledTwice).to.be.true;
            const name1 = editSpy.firstCall.args[0].detail.edit.node.getAttribute('name');
            const name2 = editSpy.secondCall.args[0].detail.edit.node.getAttribute('name');
            expect(name1).to.not.equal(name2);
        });
        it('sets SLD width and height attributes on new substation', () => {
            const fab = queryToolbar(toolbar, '[title="Add Substation"]');
            clickInteractive(fab);
            const node = editSpy.firstCall.args[0].detail.edit.node;
            const sldAttrs = node.querySelector('Private[type="OpenSCD-SLD-Layout"]');
            expect(!!sldAttrs).to.be.true;
        });
    });
    describe('zoom controls', () => {
        let toolbar;
        let zoomSpy;
        beforeEach(async () => {
            const doc = new DOMParser().parseFromString(substationDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .gridSize=${32}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            zoomSpy = spy();
            toolbar.addEventListener('zoom', zoomSpy);
        });
        it('dispatches zoom event with direction "in"', async () => {
            const zoomIn = queryToolbar(toolbar, '[title^="Zoom In"]');
            expect(!!zoomIn).to.be.true;
            zoomIn.click();
            expect(zoomSpy.calledOnce).to.be.true;
            expect(zoomSpy.firstCall.args[0].detail.direction).to.equal('in');
        });
        it('dispatches zoom event with direction "out"', async () => {
            const zoomOut = queryToolbar(toolbar, '[title^="Zoom Out"]');
            expect(!!zoomOut).to.be.true;
            zoomOut.click();
            expect(zoomSpy.calledOnce).to.be.true;
            expect(zoomSpy.firstCall.args[0].detail.direction).to.equal('out');
        });
        it('disables zoom out button when gridSize is below threshold', async () => {
            toolbar.gridSize = 3;
            await toolbar.updateComplete;
            const zoomOut = queryToolbar(toolbar, '[title^="Zoom Out"]');
            expect(zoomOut?.hasAttribute('disabled')).to.be.true;
        });
    });
    describe('placement events', () => {
        let toolbar;
        let placingSpy;
        beforeEach(async () => {
            const doc = new DOMParser().parseFromString(substationDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            placingSpy = spy();
            toolbar.addEventListener('oscd-sld-start-interaction', placingSpy);
        });
        it('dispatches a placing intent for VoltageLevel', () => {
            const fab = queryToolbar(toolbar, '[title="Add VoltageLevel"]');
            expect(!!fab).to.be.true;
            clickInteractive(fab);
            expect(placingSpy.calledOnce).to.be.true;
            expect(placingSpy.firstCall.args[0].detail.mode).to.equal('placing');
            expect(placingSpy.firstCall.args[0].detail.element.tagName).to.equal('VoltageLevel');
        });
        it('dispatches a placing intent for ConductingEquipment', () => {
            const fab = queryToolbar(toolbar, '[title="Add CBR"]');
            expect(!!fab).to.be.true;
            clickInteractive(fab);
            expect(placingSpy.calledOnce).to.be.true;
            const el = placingSpy.firstCall.args[0].detail.element;
            expect(el.tagName).to.equal('ConductingEquipment');
            expect(el.getAttribute('type')).to.equal('CBR');
        });
        it('dispatches a placing intent for PowerTransformer', () => {
            const fab = queryToolbar(toolbar, '[title="Add Two Winding Transformer"]');
            expect(!!fab).to.be.true;
            clickInteractive(fab);
            expect(placingSpy.calledOnce).to.be.true;
            const el = placingSpy.firstCall.args[0].detail.element;
            expect(el.tagName).to.equal('PowerTransformer');
            expect(el.querySelectorAll('TransformerWinding').length).to.equal(2);
        });
    });
    describe('view controls', () => {
        let toolbar;
        let viewChangeSpy;
        beforeEach(async () => {
            const doc = new DOMParser().parseFromString(substationDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            viewChangeSpy = spy();
            toolbar.addEventListener('view-change', viewChangeSpy);
        });
        it('dispatches view-change when toggling labels', () => {
            const toggle = queryToolbar(toolbar, '[title="Toggle Labels"]');
            clickInteractive(toggle);
            expect(viewChangeSpy.calledOnce).to.be.true;
            expect(viewChangeSpy.firstCall.args[0].detail.showLabels).to.be.false;
        });
        it('dispatches view-change when toggling IEDs', () => {
            const toggle = queryToolbar(toolbar, '[title="Toggle IEDs"]');
            clickInteractive(toggle);
            expect(viewChangeSpy.calledOnce).to.be.true;
            expect(viewChangeSpy.firstCall.args[0].detail.showIeds).to.be.false;
        });
    });
    describe('action button', () => {
        let toolbar;
        it('opens the about dialog when not in action', async () => {
            const doc = new DOMParser().parseFromString(emptyDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            const btn = queryToolbar(toolbar, '[title="About"]');
            clickInteractive(btn);
            await toolbar.updateComplete;
            const dialog = toolbar.shadowRoot.querySelector('#about');
            expect(dialog?.hasAttribute('open')).to.be.true;
        });
        it('dispatches "cancel" when in action', async () => {
            const doc = new DOMParser().parseFromString(emptyDocString, 'application/xml');
            toolbar = await fixture(html `<sld-toolbar
          .doc=${doc}
          .docVersion=${0}
          .inAction=${true}
          .templateElements=${makeTemplateElements(doc)}
        ></sld-toolbar>`);
            await toolbar.updateComplete;
            const cancelSpy = spy();
            toolbar.addEventListener('cancel', cancelSpy);
            const btn = queryToolbar(toolbar, '[title="Cancel"]');
            clickInteractive(btn);
            expect(cancelSpy.calledOnce).to.be.true;
        });
    });
});
//# sourceMappingURL=sld-toolbar.spec.js.map