import { fixture, expect } from '@open-wc/testing';
import { html } from 'lit';
import { SldSubstationHeader } from './sld-substation-header.js';
customElements.define('sld-substation-header', SldSubstationHeader);
describe('sld-substation-header', () => {
    function substationElement(name = 'S1') {
        const doc = new DOMParser().parseFromString(`<SCL xmlns="http://www.iec.ch/61850/2003/SCL"><Substation name="${name}"/></SCL>`, 'application/xml');
        return doc.querySelector('Substation');
    }
    async function headerFixture({ name = 'S1', disabled = false, } = {}) {
        return fixture(html `<sld-substation-header
      .substation=${substationElement(name)}
      ?disabled=${disabled}
    ></sld-substation-header>`);
    }
    function buttons(element) {
        return Array.from(element.shadowRoot.querySelectorAll('h2 > oscd-icon-button'));
    }
    function click(button) {
        button.shadowRoot?.querySelector('#button')?.click();
    }
    it('renders the substation name', async () => {
        const element = await headerFixture({ name: 'Grid' });
        expect(element.shadowRoot.querySelector('h2').textContent).to.contain('Grid');
    });
    it('renders edit, resize, delete and export buttons in order', async () => {
        const element = await headerFixture();
        expect(buttons(element)).to.have.lengthOf(4);
    });
    it('emits oscd-sld-edit-scl for the substation when the edit button is clicked', async () => {
        const substation = substationElement();
        const element = await fixture(html `<sld-substation-header
      .substation=${substation}
    ></sld-substation-header>`);
        let detail;
        element.addEventListener('oscd-sld-edit-scl', (event) => {
            detail = event.detail.element;
        });
        click(buttons(element)[2]);
        expect(detail).to.equal(substation);
    });
    it('emits oscd-sld-substation-resize when the resize button is clicked', async () => {
        const element = await headerFixture();
        let fired = false;
        element.addEventListener('oscd-sld-substation-resize', () => {
            fired = true;
        });
        click(buttons(element)[0]);
        expect(fired).to.be.true;
    });
    it('emits oscd-sld-substation-delete when the delete button is clicked', async () => {
        const element = await headerFixture();
        let fired = false;
        element.addEventListener('oscd-sld-substation-delete', () => {
            fired = true;
        });
        click(buttons(element)[3]);
        expect(fired).to.be.true;
    });
    it('emits oscd-sld-substation-export when the export button is clicked', async () => {
        const element = await headerFixture();
        let fired = false;
        element.addEventListener('oscd-sld-substation-export', () => {
            fired = true;
        });
        click(buttons(element)[1]);
        expect(fired).to.be.true;
    });
    it('emits header events that bubble and cross shadow boundaries', async () => {
        const element = await headerFixture();
        const event = await new Promise((resolve) => {
            element.addEventListener('oscd-sld-edit-scl', resolve, { once: true });
            click(buttons(element)[2]);
        });
        expect(event.bubbles).to.be.true;
        expect(event.composed).to.be.true;
    });
    it('marks the header disabled when the disabled property is set', async () => {
        const element = await headerFixture({ disabled: true });
        expect(element.shadowRoot.querySelector('h2').classList.contains('disabled')).to.be.true;
    });
});
//# sourceMappingURL=sld-substation-header.spec.js.map