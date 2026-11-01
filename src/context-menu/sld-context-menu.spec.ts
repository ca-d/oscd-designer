import { html } from 'lit';
import { fixture, expect, waitUntil } from '@open-wc/testing';
import { setViewport } from '@web/test-runner-commands';

import { SldContextMenu } from './sld-context-menu.js';

import { sldFixture } from '../test-helpers.js';
import { sldNs } from '../foundations.js';

customElements.define('sld-context-menu', SldContextMenu);

function makeDoc(): XMLDocument {
  return sldFixture({
    children: `
      <ConductingEquipment name="CBR1" type="CBR">
        <Terminal name="T1" cNodeName="CN1" connectivityNode="S1/V1/B1/CN1"/>
        <Terminal name="T2" cNodeName="CN2" connectivityNode="S1/V1/B1/CN2"/>
        <Private type="https://openscd.org/SCL/SSD/SLD/v0">
          <smth:SLDAttributes xmlns:smth="${sldNs}"
            smth:x="4" smth:y="4" smth:rot="0" />
        </Private>
      </ConductingEquipment>
      <ConductingEquipment name="DIS1" type="DIS" desc="Disconnector">
        <Terminal name="T1" cNodeName="CN1" connectivityNode="S1/V1/B1/CN1"/>
        <Terminal name="T2" cNodeName="CN2" connectivityNode="S1/V1/B1/CN2"/>
        <Private type="https://openscd.org/SCL/SSD/SLD/v0">
          <smth:SLDAttributes xmlns:smth="${sldNs}"
            smth:x="5" smth:y="5" smth:rot="0" />
        </Private>
      </ConductingEquipment>
      <PowerTransformer name="PTR1" type="PTR" desc="Main Transformer">
        <TransformerWinding name="W1">
          <Terminal name="T1" cNodeName="CN1" connectivityNode="S1/V1/B1/CN1"/>
        </TransformerWinding>
        <TransformerWinding name="W2">
          <Terminal name="T1" cNodeName="CN2" connectivityNode="S1/V1/B1/CN2"/>
        </TransformerWinding>
        <Private type="https://openscd.org/SCL/SSD/SLD/v0">
          <smth:SLDAttributes xmlns:smth="${sldNs}"
            smth:x="6" smth:y="6" smth:rot="0" />
        </Private>
      </PowerTransformer>
      <ConnectivityNode name="CN1" pathName="S1/V1/B1/CN1"/>
      <ConnectivityNode name="CN2" pathName="S1/V1/B1/CN2"/>`,
  });
}

function oscdMenu(el: SldContextMenu): HTMLElement {
  return el.shadowRoot!.querySelector('oscd-menu')!;
}

describe('SldContextMenu', () => {
  let el: SldContextMenu;
  let doc: XMLDocument;

  beforeEach(async () => {
    doc = makeDoc();
    el = await fixture(
      html`<sld-context-menu .doc=${doc} .nsp=${'smth'}></sld-context-menu>`,
    );
  });

  describe('open / close lifecycle', () => {
    it('oscd-menu is present but not open initially', () => {
      const menu = oscdMenu(el);
      expect(menu).to.not.be.null;
      expect(menu.hasAttribute('open')).to.be.false;
    });

    it('populates menu items after open() is called', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const items = el.shadowRoot!.querySelectorAll('oscd-menu-item');
      expect(items.length).to.be.greaterThan(0);
    });

    it('clears context when oscd-menu fires closed event', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      oscdMenu(el).dispatchEvent(new Event('closed'));
      await el.updateComplete;

      const items = el.shadowRoot!.querySelectorAll('oscd-menu-item');
      expect(items.length).to.equal(0);
    });
  });

  describe('anchor positioning', () => {
    it('positions anchor at given x coordinate', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 150, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const anchor = el.shadowRoot!.querySelector(
        '#ctx-anchor',
      ) as HTMLElement;
      expect(anchor.style.left).to.equal('150px');
    });

    it('offsets anchor top by menuHeaderHeight (57 for element without desc/type)', async () => {
      const element = doc.querySelector('ConnectivityNode[name="CN1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const anchor = el.shadowRoot!.querySelector(
        '#ctx-anchor',
      ) as HTMLElement;
      // ConnectivityNode has no desc/type → height=57, so top = 200-57 = 143
      expect(anchor.style.top).to.equal('143px');
    });

    it('offsets anchor top by 73 for element with desc attribute', async () => {
      const element = doc.querySelector(
        'ConductingEquipment[name="DIS1"]',
      )!;
      el.open({ element, x: 100, y: 200, gridX: 5, gridY: 5 });
      await el.updateComplete;

      const anchor = el.shadowRoot!.querySelector(
        '#ctx-anchor',
      ) as HTMLElement;
      // DIS1 has desc="Disconnector" → height=73, top = 200-73 = 127
      expect(anchor.style.top).to.equal('127px');
    });

    it('offsets anchor top by 73 for element with type attribute', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const anchor = el.shadowRoot!.querySelector(
        '#ctx-anchor',
      ) as HTMLElement;
      // CBR1 has type="CBR" → height=73, top = 200-73 = 127
      expect(anchor.style.top).to.equal('127px');
    });
  });

  describe('placement', () => {
    beforeEach(async () => {
      await setViewport({ width: 800, height: 600 });
    });

    async function openAt(element: Element, y: number) {
      el.open({ element, x: 100, y, gridX: 4, gridY: 4 });
      await el.updateComplete;
      const menu = oscdMenu(el);
      await waitUntil(
        () => menu.hasAttribute('open') && menu.style.visibility === '',
        'menu was not placed',
      );
      const surface = menu.shadowRoot!.querySelector<HTMLElement>('.menu')!;
      const list = menu.shadowRoot!.querySelector<HTMLElement>('.items')!;
      return {
        rect: surface.getBoundingClientRect(),
        firstAction: el
          .shadowRoot!.querySelector('oscd-menu-item')!
          .getBoundingClientRect(),
        scrolls: list.scrollHeight > list.clientHeight,
      };
    }

    /** A bay has a menu of seven actions, which fits the window below or above. */
    const bay = () => doc.querySelector('Bay')!;

    it('puts the first action at the cursor where there is room', async () => {
      const { firstAction, scrolls } = await openAt(bay(), 100);

      expect(firstAction.top).to.be.closeTo(100, 1);
      expect(scrolls).to.be.false;
    });

    it('ends at the cursor where there is no room below', async () => {
      const { rect, scrolls } = await openAt(bay(), 560);

      expect(rect.bottom).to.be.closeTo(560, 1);
      expect(scrolls).to.be.false;
    });

    it('starts at the top of the window and does not scroll where it fits neither', async () => {
      const { rect, scrolls } = await openAt(bay(), 300);

      expect(rect.top).to.be.closeTo(0, 1);
      expect(rect.bottom).to.be.greaterThan(300);
      expect(scrolls).to.be.false;
    });

    it('only scrolls once it is as high as the window', async () => {
      await setViewport({ width: 800, height: 300 });
      const { rect, scrolls } = await openAt(bay(), 150);

      expect(rect.top).to.be.closeTo(0, 1);
      expect(rect.bottom).to.be.closeTo(300, 1);
      expect(scrolls).to.be.true;
    });
  });

  describe('header rendering', () => {
    it('shows element name in headline', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const headline = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"] [slot="headline"]',
      );
      expect(headline).to.not.be.null;
      expect(headline!.textContent!.trim()).to.equal('CBR1');
    });

    it('shows tagName when element has no name attribute', async () => {
      const element = doc.querySelector('ConnectivityNode[name="CN1"]')!;
      element.removeAttribute('name');
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const headline = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"] [slot="headline"]',
      );
      expect(headline!.textContent!.trim()).to.equal('ConnectivityNode');
    });

    it('shows desc in supporting-text', async () => {
      const element = doc.querySelector(
        'ConductingEquipment[name="DIS1"]',
      )!;
      el.open({ element, x: 100, y: 200, gridX: 5, gridY: 5 });
      await el.updateComplete;

      const supporting = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"] [slot="supporting-text"]',
      );
      expect(supporting).to.not.be.null;
    });

    it('shows type in supporting-text when present', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const supporting = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"] [slot="supporting-text"]',
      );
      expect(supporting).to.not.be.null;
    });

    it('renders no supporting-text for element without desc/type/textContent', async () => {
      const element = doc.querySelector('ConnectivityNode[name="CN1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const supporting = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"] [slot="supporting-text"]',
      );
      expect(supporting).to.be.null;
    });

    it('renders PowerTransformer header with 3-winding icon', async () => {
      const ptr3Doc = sldFixture({
        children: `
          <PowerTransformer name="PTR3" type="PTR">
            <TransformerWinding name="W1"><Terminal name="T1"/></TransformerWinding>
            <TransformerWinding name="W2"><Terminal name="T1"/></TransformerWinding>
            <TransformerWinding name="W3"><Terminal name="T1"/></TransformerWinding>
            <Private type="https://openscd.org/SCL/SSD/SLD/v0">
              <smth:SLDAttributes xmlns:smth="${sldNs}" smth:x="2" smth:y="2" smth:rot="0"/>
            </Private>
          </PowerTransformer>`,
      });
      el.doc = ptr3Doc;
      const element = ptr3Doc.querySelector('PowerTransformer[name="PTR3"]')!;
      el.open({ element, x: 100, y: 200, gridX: 2, gridY: 2 });
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"]',
      );
      expect(header).to.not.be.null;
      const icon = header!.querySelector('oscd-sld-icon[slot="start"]');
      expect(icon).to.not.be.null;
      expect(icon!.textContent!.trim()).to.equal('sld_ptr_3');
    });

    it('renders PowerTransformer header with 2-winding icon', async () => {
      const element = doc.querySelector('PowerTransformer[name="PTR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 6, gridY: 6 });
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"]',
      );
      expect(header).to.not.be.null;
      const icon = header!.querySelector('oscd-sld-icon[slot="start"]');
      expect(icon).to.not.be.null;
      expect(icon!.textContent!.trim()).to.equal('sld_ptr_2');
    });

    it('renders PowerTransformer header with 1-winding icon', async () => {
      const ptr1Doc = sldFixture({
        children: `
          <PowerTransformer name="PTR1W" type="PTR">
            <TransformerWinding name="W1"><Terminal name="T1"/></TransformerWinding>
            <Private type="https://openscd.org/SCL/SSD/SLD/v0">
              <smth:SLDAttributes xmlns:smth="${sldNs}" smth:x="2" smth:y="2" smth:rot="0"/>
            </Private>
          </PowerTransformer>`,
      });
      el.doc = ptr1Doc;
      const element = ptr1Doc.querySelector('PowerTransformer[name="PTR1W"]')!;
      el.open({ element, x: 100, y: 200, gridX: 2, gridY: 2 });
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"]',
      );
      expect(header).to.not.be.null;
      const icon = header!.querySelector('oscd-sld-icon[slot="start"]');
      expect(icon).to.not.be.null;
      expect(icon!.textContent!.trim()).to.equal('sld_ptr_1');
    });

    it('renders TransformerWinding header with winding icon', async () => {
      const element = doc.querySelector('TransformerWinding[name="W1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 6, gridY: 6 });
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"]',
      );
      expect(header).to.not.be.null;
      const icon = header!.querySelector('oscd-sld-icon[slot="start"]');
      expect(icon).to.not.be.null;
      expect(icon!.textContent!.trim()).to.equal('sld_ptr_1');
    });

    it('renders Text header with title icon and textContent as detail', async () => {
      const textDoc = sldFixture({ children: '<Text>Hello World</Text>' });
      el.doc = textDoc;
      const element = textDoc.querySelector('Text')!;
      el.open({ element, x: 100, y: 200, gridX: 1, gridY: 1 });
      await el.updateComplete;

      const header = el.shadowRoot!.querySelector(
        'oscd-list-item[type="text"]',
      );
      expect(header).to.not.be.null;

      const icon = header!.querySelector('oscd-icon[slot="start"]');
      expect(icon).to.not.be.null;
      expect(icon!.textContent!.trim()).to.equal('title');

      const supporting = header!.querySelector('[slot="supporting-text"]');
      expect(supporting).to.not.be.null;
      expect(supporting!.textContent!.trim()).to.equal('Hello World');
    });
  });

  describe('menu items rendering', () => {
    it('renders action items as oscd-menu-item elements', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const menuItems = el.shadowRoot!.querySelectorAll('oscd-menu-item');
      expect(menuItems.length).to.be.greaterThan(0);
    });

    it('renders dividers as oscd-divider elements', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const dividers = el.shadowRoot!.querySelectorAll('oscd-divider');
      expect(dividers.length).to.be.greaterThan(0);
    });
  });

  describe('action dispatch', () => {
    it('dispatches event when an action is clicked', async () => {
      const element = doc.querySelector('ConductingEquipment[name="CBR1"]')!;
      el.open({ element, x: 100, y: 200, gridX: 4, gridY: 4 });
      await el.updateComplete;

      const menuItem = el.shadowRoot!.querySelector(
        'oscd-menu-item',
      ) as HTMLElement;
      expect(menuItem).to.not.be.null;

      const dispatched: Event[] = [];
      el.addEventListener('oscd-edit-v2', (e: Event) => dispatched.push(e));
      el.addEventListener('oscd-sld-edit', (e: Event) => dispatched.push(e));

      menuItem.click();
      await el.updateComplete;

      // oscd-menu handles closing via close-menu event from oscd-menu-item
      expect(dispatched.length).to.be.greaterThan(0);
    });
  });
});
