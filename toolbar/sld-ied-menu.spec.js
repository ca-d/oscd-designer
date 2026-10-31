import { html } from 'lit';
import { fixture, expect } from '@open-wc/testing';
import { spy } from 'sinon';
import { SldIedMenu } from './sld-ied-menu.js';
import { sldNs } from '../foundations.js';
if (!customElements.get('sld-ied-menu')) {
    customElements.define('sld-ied-menu', SldIedMenu);
}
const iedDocString = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" xmlns:eosld="https://openscd.org/SCL/SSD/SLD/v0">
  <IED name="IED1" manufacturer="Dummy" type="DummyType" />
  <IED name="IED2" manufacturer="Dummy" />
  <Substation name="S1">
    <Private type="OpenSCD-SLD-Layout">
      <eosld:SLDAttributes eosld:w="50" eosld:h="25" />
    </Private>
    <VoltageLevel name="V1">
      <Private type="OpenSCD-SLD-Layout">
        <eosld:SLDAttributes eosld:x="1" eosld:y="1" eosld:w="13" eosld:h="13" />
      </Private>
    </VoltageLevel>
  </Substation>
</SCL>`;
function makeDocWithPlacedIed() {
    const doc = new DOMParser().parseFromString(iedDocString, 'application/xml');
    const vlPrivate = doc.querySelector('VoltageLevel > Private[type="OpenSCD-SLD-Layout"]');
    const ref = doc.createElementNS(sldNs, 'eosld:Reference');
    ref.setAttributeNS(sldNs, 'eosld:id', 'IED1');
    ref.setAttributeNS(sldNs, 'eosld:type', 'IED');
    const attrs = doc.createElementNS(sldNs, 'eosld:SLDAttributes');
    attrs.setAttributeNS(sldNs, 'eosld:x', '3');
    attrs.setAttributeNS(sldNs, 'eosld:y', '3');
    ref.appendChild(attrs);
    vlPrivate.appendChild(ref);
    return doc;
}
function makeDocWithUnmatchedRef() {
    const doc = new DOMParser().parseFromString(iedDocString, 'application/xml');
    const vlPrivate = doc.querySelector('VoltageLevel > Private[type="OpenSCD-SLD-Layout"]');
    const ref = doc.createElementNS(sldNs, 'eosld:Reference');
    ref.setAttributeNS(sldNs, 'eosld:id', 'MissingIED');
    ref.setAttributeNS(sldNs, 'eosld:type', 'IED');
    const attrs = doc.createElementNS(sldNs, 'eosld:SLDAttributes');
    attrs.setAttributeNS(sldNs, 'eosld:x', '4');
    attrs.setAttributeNS(sldNs, 'eosld:y', '4');
    ref.appendChild(attrs);
    vlPrivate.appendChild(ref);
    return doc;
}
function queryMenu(menu, selector) {
    return menu.shadowRoot.querySelector(selector);
}
function queryAllMenuItems(menu) {
    return Array.from(menu.shadowRoot.querySelectorAll('oscd-menu-item'));
}
function clickItem(item) {
    const target = item.shadowRoot?.querySelector('#button, #item') ?? item;
    target.click();
}
describe('SldIedMenu', () => {
    let menu;
    describe('with IEDs in doc', () => {
        let placingSpy;
        beforeEach(async () => {
            const doc = new DOMParser().parseFromString(iedDocString, 'application/xml');
            menu = await fixture(html `<sld-ied-menu .doc=${doc} .docVersion=${0}></sld-ied-menu>`);
            await menu.updateComplete;
            placingSpy = spy();
            menu.addEventListener('oscd-sld-start-interaction', placingSpy);
        });
        it('renders the Add IED button', () => {
            const fab = queryMenu(menu, 'oscd-fab[title="Add IED"]');
            expect(!!fab).to.be.true;
        });
        it('shows available IEDs in the menu', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const items = queryAllMenuItems(menu).filter(item => item.getAttribute('data-name') !== 'Delete Unmatched');
            expect(items.length).to.equal(2);
            expect(items[0].getAttribute('data-name')).to.equal('IED1');
            expect(items[1].getAttribute('data-name')).to.equal('IED2');
        });
        it('dispatches a placing intent with a Reference element on IED selection', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const item = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'IED1');
            clickItem(item);
            await menu.updateComplete;
            expect(placingSpy.calledOnce).to.be.true;
            const { element } = placingSpy.firstCall.args[0].detail;
            expect(element.localName).to.equal('Reference');
            expect(element.namespaceURI).to.equal(sldNs);
            expect(element.getAttributeNS(sldNs, 'id')).to.equal('IED1');
            expect(element.getAttributeNS(sldNs, 'type')).to.equal('IED');
        });
        it('shows supporting text with manufacturer and type', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const item = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'IED1');
            const supporting = item
                .querySelector('[slot="supporting-text"]')
                ?.textContent?.trim();
            expect(supporting).to.include('Dummy');
            expect(supporting).to.include('DummyType');
        });
    });
    describe('with a placed IED', () => {
        beforeEach(async () => {
            const doc = makeDocWithPlacedIed();
            menu = await fixture(html `<sld-ied-menu .doc=${doc} .docVersion=${0}></sld-ied-menu>`);
            await menu.updateComplete;
        });
        it('shows pin_drop icon for placed IEDs', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const item = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'IED1');
            const icon = item.querySelector('oscd-icon[slot="end"]');
            expect(icon?.textContent?.trim()).to.equal('pin_drop');
        });
        it('does not show pin_drop icon for unplaced IEDs', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const item = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'IED2');
            const icon = item.querySelector('oscd-icon[slot="end"]');
            expect(!!icon).to.be.false;
        });
    });
    describe('with unmatched IED references', () => {
        let editSpy;
        beforeEach(async () => {
            const doc = makeDocWithUnmatchedRef();
            menu = await fixture(html `<sld-ied-menu .doc=${doc} .docVersion=${0}></sld-ied-menu>`);
            await menu.updateComplete;
            editSpy = spy();
            menu.addEventListener('oscd-edit-v2', editSpy);
        });
        it('shows remove unmatched item with correct count', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const deleteItem = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'Delete Unmatched');
            expect(!!deleteItem).to.be.true;
            const text = deleteItem.textContent?.replace(/\s+/g, ' ').trim();
            expect(text).to.include('Remove reference to 1 missing IED');
        });
        it('dispatches oscd-edit-v2 when removing unmatched references', async () => {
            queryMenu(menu, 'oscd-fab[title="Add IED"]').click();
            await menu.updateComplete;
            const deleteItem = queryAllMenuItems(menu).find(el => el.getAttribute('data-name') === 'Delete Unmatched');
            clickItem(deleteItem);
            await menu.updateComplete;
            expect(editSpy.calledOnce).to.be.true;
        });
    });
});
//# sourceMappingURL=sld-ied-menu.spec.js.map