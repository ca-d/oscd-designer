import { __decorate } from "tslib";
import { LitElement, html, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { newEditEventV2 } from '@openscd/oscd-api/utils.js';
import { identity } from '@openscd/scl-lib';
import { OscdFab } from '@omicronenergy/oscd-ui/fab/OscdFab.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdListItem } from '@omicronenergy/oscd-ui/list/OscdListItem.js';
import { OscdMenu } from '@omicronenergy/oscd-ui/menu/OscdMenu.js';
import { OscdMenuItem } from '@omicronenergy/oscd-ui/menu/OscdMenuItem.js';
import { sldThemeStyles } from '../theme.js';
import { sldNs, sldPrefix } from '../foundations.js';
import { iedReferences } from '../foundations/ied.js';
import { createRemoveIedReferenceEdit } from '../foundations/ied-edits.js';
import { getSLDAttributes } from '../foundations/sld-attributes.js';
import { newStartInteractionEvent } from '../foundations/events.js';
/**
 * A FAB that opens a menu listing IEDs available for placement on the SLD.
 * Shows three sections: unmatched references (deletable), available (unused)
 * IEDs, and already-used IEDs (repositionable).
 */
export class SldIedMenu extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this.docVersion = -1;
        this.menuOpen = false;
    }
    get nsp() {
        return sldPrefix(this.doc);
    }
    get model() {
        if (this.cachedModel?.doc === this.doc &&
            this.cachedModel.docVersion === this.docVersion) {
            return this.cachedModel;
        }
        this.cachedModel = this.createModel();
        return this.cachedModel;
    }
    createModel() {
        const ieds = Array.from(this.doc.querySelectorAll(':root > IED'));
        const iedIdentities = new Set(ieds.map(ied => String(identity(ied))));
        const iedRefs = Array.from(this.doc.querySelectorAll(':root > Substation')).flatMap(substation => iedReferences(substation));
        const refByIedIdentity = new Map();
        for (const ref of iedRefs) {
            const id = ref.getAttributeNS(sldNs, 'id');
            if (id && !refByIedIdentity.has(id)) {
                refByIedIdentity.set(id, ref);
            }
        }
        const unusedIedRefs = iedRefs.filter((ref) => {
            const id = ref.getAttributeNS(sldNs, 'id');
            return !id || !iedIdentities.has(id);
        });
        const unusedIeds = ieds.filter(ied => !refByIedIdentity.has(String(identity(ied))));
        const usedIeds = ieds
            .filter(ied => !!getSLDAttributes(refByIedIdentity.get(String(identity(ied))) ?? ied, 'x'))
            .sort((a, b) => (a.getAttribute('name') ?? '').localeCompare(b.getAttribute('name') ?? '', undefined, { sensitivity: 'base' }));
        return {
            doc: this.doc,
            docVersion: this.docVersion,
            ieds,
            iedRefs,
            refByIedIdentity,
            unusedIeds,
            unusedIedRefs,
            usedIeds,
        };
    }
    insertOrGetIedReference(ied) {
        const existing = iedReferences(this.doc).find(ref => ref.getAttributeNS(sldNs, 'id') === identity(ied));
        if (existing) {
            return existing;
        }
        const newRef = this.doc.createElementNS(sldNs, `${this.nsp}:Reference`);
        newRef.setAttributeNS(sldNs, `${this.nsp}:id`, String(identity(ied)));
        newRef.setAttributeNS(sldNs, `${this.nsp}:type`, 'IED');
        return newRef;
    }
    closeMenu() {
        this.menuOpen = false;
        if (this.menu) {
            this.menu.open = false;
        }
    }
    handleDeleteUnmatched() {
        const edits = this.model.unusedIedRefs.map(ref => createRemoveIedReferenceEdit(ref));
        this.dispatchEvent(newEditEventV2(edits));
        this.closeMenu();
    }
    handleSelectIed(ied) {
        const element = this.insertOrGetIedReference(ied);
        this.closeMenu();
        this.dispatchEvent(newStartInteractionEvent({ mode: 'placing', element }));
    }
    updated() {
        if (this.menu) {
            this.menu.anchorElement = this.menu.previousElementSibling;
        }
    }
    renderUnmatchedSection({ unusedIedRefs }) {
        if (unusedIedRefs.length === 0) {
            return nothing;
        }
        return html `<oscd-menu-item
      data-name="Delete Unmatched"
      style="color: var(--oscd-sld-unresolved-reference-color);"
      @click=${() => this.handleDeleteUnmatched()}
    >
      <oscd-icon slot="start">delete</oscd-icon>
      <div slot="headline">
        Remove reference to ${unusedIedRefs.length} missing
        IED${unusedIedRefs.length > 1 ? 's' : ''} from the SLD
      </div>
    </oscd-menu-item>`;
    }
    renderAvailableSection({ unusedIeds }) {
        if (unusedIeds.length === 0) {
            return nothing;
        }
        return html `<oscd-list-item type="text">
        <div slot="headline"><strong>Available IEDs</strong></div>
      </oscd-list-item>
      ${unusedIeds.map(ied => html `<oscd-menu-item
          data-name="${ied.getAttribute('name')}"
          @click=${() => this.handleSelectIed(ied)}
        >
          <div slot="headline">${ied.getAttribute('name')}</div>
          <div slot="supporting-text">
            ${[
            ied.getAttribute('manufacturer'),
            ied.getAttribute('type'),
            ied.getAttribute('desc'),
        ]
            .filter(a => !!a)
            .join(' - ')}
          </div>
        </oscd-menu-item>`)}`;
    }
    renderUsedSection({ usedIeds }) {
        if (usedIeds.length === 0) {
            return nothing;
        }
        return html `<oscd-list-item type="text">
        <div slot="headline"><strong>Used IEDs</strong></div>
      </oscd-list-item>
      ${usedIeds.map(ied => html `<oscd-menu-item
          data-name="${ied.getAttribute('name')}"
          @click=${() => this.handleSelectIed(ied)}
        >
          <div slot="headline">${ied.getAttribute('name')}</div>
          <div slot="supporting-text">
            ${[
            ied.getAttribute('manufacturer'),
            ied.getAttribute('type'),
            ied.getAttribute('desc'),
        ]
            .filter(a => !!a)
            .join(' - ')}
          </div>
          <oscd-icon slot="end">pin_drop</oscd-icon>
        </oscd-menu-item>`)}`;
    }
    renderOpenMenuContent() {
        const model = this.model;
        return html `${this.renderUnmatchedSection(model)}
    ${this.renderAvailableSection(model)} ${this.renderUsedSection(model)}`;
    }
    render() {
        return html `<oscd-fab
        size="small"
        aria-label="Add IED"
        title="Add IED"
        @click=${() => {
            this.menuOpen = true;
            if (this.menu) {
                this.menu.open = true;
            }
        }}
        ><oscd-icon slot="icon">developer_board</oscd-icon></oscd-fab
      >
      <oscd-menu positioning="fixed" id="iedMenu">
        ${this.menuOpen ? this.renderOpenMenuContent() : nothing}
      </oscd-menu>`;
    }
}
SldIedMenu.styles = [sldThemeStyles];
SldIedMenu.scopedElements = {
    'oscd-fab': OscdFab,
    'oscd-icon': OscdIcon,
    'oscd-list-item': OscdListItem,
    'oscd-menu': OscdMenu,
    'oscd-menu-item': OscdMenuItem,
};
__decorate([
    property({ type: Object })
], SldIedMenu.prototype, "doc", void 0);
__decorate([
    property({ type: Number })
], SldIedMenu.prototype, "docVersion", void 0);
__decorate([
    state()
], SldIedMenu.prototype, "menuOpen", void 0);
__decorate([
    query('oscd-menu')
], SldIedMenu.prototype, "menu", void 0);
//# sourceMappingURL=sld-ied-menu.js.map