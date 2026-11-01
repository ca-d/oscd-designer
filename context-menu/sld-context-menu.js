import { __decorate } from "tslib";
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { OscdDivider } from '@omicronenergy/oscd-ui/divider/OscdDivider.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdListItem } from '@omicronenergy/oscd-ui/list/OscdListItem.js';
import { OscdMenu } from '@omicronenergy/oscd-ui/menu/OscdMenu.js';
import { OscdMenuItem } from '@omicronenergy/oscd-ui/menu/OscdMenuItem.js';
import { OscdSldIcon } from '../oscd-sld-icon.js';
import { isBusBar } from '../foundations/connectivity.js';
import { isIedReferenceElement } from '../foundations/ied.js';
import { attributes } from '../foundations/sld-attributes.js';
import { createContextMenuItems } from './sld-context-menu-factory.js';
import { sldThemeStyles } from '../theme.js';
function renderSldStartIcon(icon) {
    return html `<oscd-sld-icon slot="start">${icon}</oscd-sld-icon>`;
}
function transformerIconName(windings, kind) {
    return kind && kind !== 'default'
        ? `sld_ptr_${windings}_${kind}`
        : `sld_ptr_${windings}`;
}
function renderDivider() {
    return html `<oscd-divider></oscd-divider>`;
}
/** Resolves on the next `type` event of `target`, or after a second at the latest. */
function nextEvent(target, type) {
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            target.removeEventListener(type, done);
            resolve();
        };
        const timer = setTimeout(done, 1000);
        target.addEventListener(type, done);
    });
}
/** The innermost element at a point, looking into shadow roots. */
function deepElementFromPoint(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element?.shadowRoot) {
        const inner = element.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === element) {
            break;
        }
        element = inner;
    }
    return element;
}
function renderHeader({ element }) {
    let name = element.getAttribute('name') || element.tagName;
    let detail = element.getAttribute('desc');
    const type = element.getAttribute('type');
    if (type) {
        if (detail) {
            detail = html `${type} &mdash; ${detail}`;
        }
        else {
            detail = type;
        }
    }
    let footerGraphic = renderSldStartIcon('sld_conducting_equipment');
    if (element.tagName === 'PowerTransformer') {
        const windings = element.querySelectorAll('TransformerWinding').length;
        const { kind } = attributes(element);
        if (windings === 3) {
            footerGraphic = renderSldStartIcon(transformerIconName(3));
        }
        else if (windings === 2) {
            footerGraphic = renderSldStartIcon(transformerIconName(2, kind));
        }
        else {
            footerGraphic = renderSldStartIcon(transformerIconName(1, kind));
        }
    }
    else if (element.tagName === 'TransformerWinding') {
        footerGraphic = renderSldStartIcon('sld_ptr_1');
    }
    else if (element.tagName === 'ConductingEquipment') {
        footerGraphic = renderSldStartIcon(type ? `sld_equipment_${type}` : 'sld_conducting_equipment');
    }
    else if (element.tagName === 'Bay' && isBusBar(element)) {
        footerGraphic = html `<oscd-icon slot="start">horizontal_rule</oscd-icon>`;
    }
    else if (element.tagName === 'Bay') {
        footerGraphic = renderSldStartIcon('sld_bay');
    }
    else if (element.tagName === 'VoltageLevel') {
        footerGraphic = renderSldStartIcon('sld_voltage_level');
    }
    else if (element.tagName === 'Substation') {
        footerGraphic = html `<oscd-icon slot="start">margin</oscd-icon>`;
    }
    else if (isIedReferenceElement(element)) {
        name = 'IED';
        footerGraphic = html `<oscd-icon slot="start">developer_board</oscd-icon>`;
    }
    else if (element.tagName === 'Text') {
        footerGraphic = html `<oscd-icon slot="start">title</oscd-icon>`;
        detail = element.textContent;
    }
    else if (element.tagName === 'ConnectivityNode') {
        footerGraphic = html `<oscd-icon slot="start">cable</oscd-icon>`;
    }
    return html `<oscd-list-item type="text">
      <div slot="headline">${name}</div>
      ${detail
        ? html `<div
            slot="supporting-text"
            style="display: inline-block; max-width: 15em; overflow: hidden; text-overflow: ellipsis;"
          >
            ${detail}
          </div>`
        : nothing}
      ${footerGraphic}
    </oscd-list-item>`;
}
function menuHeaderHeight(element) {
    return element.hasAttribute('desc') ||
        element.hasAttribute('type') ||
        (element.tagName === 'Text' && element.textContent)
        ? 73
        : 57;
}
export class SldContextMenu extends ScopedElementsMixin(LitElement) {
    async open(context) {
        this.context = context;
        this.requested = context;
        await this.updateComplete;
        if (this.requested !== context) {
            return;
        }
        const { anchor, menu } = this;
        anchor.style.left = `${context.x}px`;
        anchor.style.top = `${context.y - menuHeaderHeight(context.element)}px`;
        menu.anchorElement = anchor;
        // Laid out unseen first, so that it can be placed by its full height.
        menu.style.visibility = 'hidden';
        const wasOpen = menu.open;
        const opened = nextEvent(menu, 'opened');
        menu.show();
        if (!wasOpen) {
            await opened;
        }
        if (this.context === context) {
            await this.place(context.y);
        }
        menu.style.visibility = '';
    }
    /**
     * Puts the first action at the cursor height `y`. A menu that does not fit
     * below that ends at the cursor instead, and one that does not fit above it
     * either starts at the top of the window and only scrolls once it is as high
     * as the window.
     */
    async place(y) {
        const { anchor, menu } = this;
        const surface = menu.shadowRoot?.querySelector('.menu');
        const list = menu.shadowRoot?.querySelector('.items');
        if (!surface || !list) {
            return;
        }
        const rect = surface.getBoundingClientRect();
        const height = rect.height + list.scrollHeight - list.clientHeight;
        const firstAction = this.renderRoot.querySelector('oscd-menu-item');
        const lead = firstAction
            ? firstAction.getBoundingClientRect().top - rect.top
            : 0;
        const below = y - lead;
        const top = below + height <= window.innerHeight
            ? Math.max(0, below)
            : Math.max(0, y - height);
        anchor.style.top = `${top}px`;
        menu.reposition();
        await new Promise(requestAnimationFrame);
        await menu.updateComplete;
    }
    handleClosed() {
        this.context = undefined;
    }
    /** Right-clicking outside the menu opens the menu of what is under the cursor instead. */
    handleScrimContextMenu(event) {
        event.preventDefault();
        const scrim = event.currentTarget;
        scrim.style.pointerEvents = 'none';
        const target = deepElementFromPoint(event.clientX, event.clientY);
        scrim.style.pointerEvents = '';
        const requested = this.requested;
        target?.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 2,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
        }));
        if (this.requested === requested) {
            this.menu.close();
        }
    }
    buildItems() {
        if (!this.context) {
            return [];
        }
        return createContextMenuItems({
            ...this.context,
            doc: this.doc,
            nsp: this.nsp,
            dispatch: event => this.dispatchEvent(event),
        });
    }
    renderAction(item) {
        return html `<oscd-menu-item
      style=${item.style ?? nothing}
      @click=${() => {
            item.handler();
            this.context = undefined;
        }}
    >
      <div slot="headline">${item.headline}</div>
      <oscd-sld-icon slot="start">${item.icon}</oscd-sld-icon>
    </oscd-menu-item>`;
    }
    renderMenuItem(item) {
        switch (item.type) {
            case 'divider':
                return renderDivider();
            case 'header':
                return renderHeader(item);
            default:
                return this.renderAction(item);
        }
    }
    render() {
        const items = this.context ? this.buildItems() : [];
        // The menu itself takes the keyboard; the scrim is only there for the mouse.
        /* eslint-disable lit-a11y/click-events-have-key-events */
        return html `
      <div id="ctx-anchor"></div>
      ${this.context
            ? html `<div
            id="scrim"
            @mousedown=${(event) => event.preventDefault()}
            @click=${() => this.menu.close()}
            @wheel=${() => this.menu.close()}
            @contextmenu=${this.handleScrimContextMenu}
          ></div>`
            : nothing}
      <oscd-menu
        positioning="fixed"
        quick
        anchor-corner="start-start"
        no-vertical-flip
        stay-open-on-focusout
        @closed=${this.handleClosed}
      >
          ${items.map(item => this.renderMenuItem(item))}
      </oscd-menu>
    `;
        /* eslint-enable lit-a11y/click-events-have-key-events */
    }
}
SldContextMenu.scopedElements = {
    'oscd-divider': OscdDivider,
    'oscd-icon': OscdIcon,
    'oscd-list-item': OscdListItem,
    'oscd-menu': OscdMenu,
    'oscd-menu-item': OscdMenuItem,
    'oscd-sld-icon': OscdSldIcon,
};
SldContextMenu.styles = [
    sldThemeStyles,
    css `
      :host {
        display: contents;
        --md-divider-color: var(--oscd-base1);
      }

      #ctx-anchor {
        position: fixed;
        width: 0;
        height: 0;
        pointer-events: none;
      }

      /* Catches the click that closes the menu, just below the menu itself. */
      #scrim {
        position: fixed;
        inset: 0;
        z-index: 19;
      }
    `,
];
__decorate([
    property({ attribute: false })
], SldContextMenu.prototype, "doc", void 0);
__decorate([
    property()
], SldContextMenu.prototype, "nsp", void 0);
__decorate([
    state()
], SldContextMenu.prototype, "context", void 0);
__decorate([
    query('#ctx-anchor')
], SldContextMenu.prototype, "anchor", void 0);
__decorate([
    query('oscd-menu')
], SldContextMenu.prototype, "menu", void 0);
//# sourceMappingURL=sld-context-menu.js.map