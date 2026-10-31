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
    else if (isIedReferenceElement(element)) {
        name = 'IED';
        footerGraphic = html `<oscd-icon slot="start">developer_board</oscd-icon>`;
    }
    else if (element.tagName === 'Text') {
        footerGraphic = html `<oscd-icon slot="start">title</oscd-icon>`;
        detail = element.textContent;
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
    open(context) {
        this.context = context;
        this.updateComplete.then(() => {
            this.anchor.style.left = `${context.x}px`;
            this.anchor.style.top = `${context.y - menuHeaderHeight(context.element)}px`;
            this.menu.anchorElement = this.anchor;
            this.menu.show();
        });
    }
    handleClosed() {
        this.context = undefined;
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
        return html `
      <div id="ctx-anchor"></div>
      <oscd-menu
        positioning="fixed"
        quick
        @closed=${this.handleClosed}
      >
          ${items.map(item => this.renderMenuItem(item))}
      </oscd-menu>
    `;
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