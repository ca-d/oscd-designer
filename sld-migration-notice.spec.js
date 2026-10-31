import { html } from 'lit';
import { fixture, expect, oneEvent } from '@open-wc/testing';
import SldMigrationNotice from './sld-migration-notice.js';
if (!customElements.get('sld-migration-notice')) {
    customElements.define('sld-migration-notice', SldMigrationNotice);
}
describe('SldMigrationNotice', () => {
    let notice;
    beforeEach(async () => {
        notice = await fixture(html `<sld-migration-notice></sld-migration-notice>`);
        await notice.updateComplete;
    });
    function convertButton() {
        return notice.shadowRoot.querySelector('oscd-filled-button');
    }
    it('renders the convert action labelled "Convert SLD Layout"', () => {
        const button = convertButton();
        expect(!!button).to.be.true;
        expect(button.textContent?.trim()).to.equal('Convert SLD Layout');
        expect(button.disabled).to.be.false;
    });
    it('offers an explanation of why conversion is needed', () => {
        const summary = notice.shadowRoot.querySelector('details summary');
        expect(summary?.textContent?.trim()).to.equal('Why is this happening?');
    });
    it('emits a composed, bubbling sld-convert event when pressed', async () => {
        setTimeout(() => convertButton().click());
        const event = await oneEvent(notice, 'sld-convert');
        expect(event).to.exist;
        expect(event.bubbles).to.be.true;
        expect(event.composed).to.be.true;
    });
    it('disables the button and shows "Converting…" while awaiting conversion', async () => {
        convertButton().click();
        await notice.updateComplete;
        const button = convertButton();
        expect(button.disabled).to.be.true;
        expect(button.textContent?.trim()).to.equal('Converting…');
    });
});
//# sourceMappingURL=sld-migration-notice.spec.js.map