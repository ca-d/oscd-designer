import { html } from 'lit';
import { fixture, expect } from '@open-wc/testing';
import { spy } from 'sinon';
import { SldIedImporter } from './sld-ied-importer.js';
if (!customElements.get('sld-ied-importer')) {
    customElements.define('sld-ied-importer', SldIedImporter);
}
describe('SldIedImporter', () => {
    let importer;
    let eventSpy;
    beforeEach(async () => {
        importer = await fixture(html `<sld-ied-importer></sld-ied-importer>`);
        await importer.updateComplete;
        eventSpy = spy();
        importer.addEventListener('start-placing-typical', eventSpy);
    });
    it('renders a FAB with upload icon', () => {
        const fab = importer.shadowRoot.querySelector('oscd-fab');
        expect(fab).to.exist;
        expect(fab?.getAttribute('title')).to.equal('Import Bay Typical');
    });
    it('contains a hidden file input', () => {
        const input = importer.shadowRoot.querySelector('input[type="file"]');
        expect(input).to.exist;
        expect(getComputedStyle(input).display).to.equal('none');
    });
    it('dispatches start-placing-typical with bay and IEDs on file load', async () => {
        const bayTypicalXml = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B" xmlns:eosld="https://openscd.org/SCL/SSD/SLD/v0">
  <IED name="TestIED1" />
  <IED name="TestIED2" />
  <Substation name="S1">
    <VoltageLevel name="V1">
      <Bay name="B1">
        <Private type="OpenSCD-SLD-Layout">
          <eosld:SLDAttributes eosld:x="1" eosld:y="1" eosld:w="3" eosld:h="3" />
        </Private>
      </Bay>
    </VoltageLevel>
  </Substation>
</SCL>`;
        await simulateFileSelect(importer, bayTypicalXml);
        expect(eventSpy.calledOnce).to.be.true;
        const { bayTypical, ieds } = eventSpy.firstCall.args[0].detail;
        expect(bayTypical.tagName).to.equal('Bay');
        expect(ieds.length).to.equal(2);
        expect(ieds[0].getAttribute('name')).to.equal('TestIED1');
    });
    it('does not dispatch placement event when file has no Bay', async () => {
        const noBayXml = `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B">
  <Substation name="S1">
    <VoltageLevel name="V1" />
  </Substation>
</SCL>`;
        await simulateFileSelect(importer, noBayXml);
        expect(eventSpy.called).to.be.false;
    });
    it('ignores a change event with no file selected', async () => {
        const input = importer.shadowRoot.querySelector('input');
        Object.defineProperty(input, 'files', {
            value: { item: () => null, length: 0 },
            writable: false,
            configurable: true,
        });
        input.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 20));
        expect(eventSpy.called).to.be.false;
    });
    it('opens the file picker when the FAB is clicked', () => {
        const input = importer.shadowRoot.querySelector('input');
        const clickSpy = spy(input, 'click');
        const fab = importer.shadowRoot.querySelector('oscd-fab');
        fab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(clickSpy.called).to.be.true;
    });
});
async function simulateFileSelect(importer, xml) {
    const file = new File([xml], 'test.scd', { type: 'application/xml' });
    const input = importer.shadowRoot.querySelector('input');
    Object.defineProperty(input, 'files', {
        value: { item: () => file, length: 1 },
        writable: false,
    });
    input.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
}
//# sourceMappingURL=sld-ied-importer.spec.js.map