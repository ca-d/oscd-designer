import { __decorate } from "tslib";
import { LitElement, html, css } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { newEditEventV2 } from '@openscd/oscd-api/utils.js';
import { insertIed } from '@openscd/scl-lib';
import { SldEditor } from './sld-editor.js';
import { makeBusBar } from './foundations/connectivity.js';
import { withSldNamespace } from './foundations/edits.js';
import { sldPrefix } from './foundations.js';
import { convertSldLayout, hasOldNamespace } from './converter.js';
import { SldToolbar } from './toolbar/sld-toolbar.js';
import { sldThemeStyles } from './theme.js';
import SldMigrationNotice from './sld-migration-notice.js';
class OscdEditorSld extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this.docVersion = -1;
        this.gridSize = 32;
        this.templateElements = {};
        this.inAction = false;
        this._showLabels = true;
        this._showIeds = true;
        /**
         * Intercepts `oscd-edit-v2` events bubbling up from the editor and toolbar and,
         * when the edit writes SLD-layout content to a document that does not yet
         * declare the namespace, re-emits it with the declaration prepended (one
         * undoable commit). Re-dispatching on the root — an ancestor of both children
         * — means the replacement never re-enters this listener, so no loop guard is
         * needed. This is the single place that enforces the namespace for child
         * edits; the root's own edits (insertIed, convertSldAttributes) apply it
         * directly at their dispatch sites.
         */
        this.normalizeEditsWithSldNS = (event) => {
            const edit = withSldNamespace(this.doc, event.detail.edit);
            if (edit === event.detail.edit) {
                return;
            }
            event.stopPropagation();
            this.dispatchEvent(newEditEventV2(edit, {
                title: event.detail.title,
                squash: event.detail.squash,
            }));
        };
    }
    get nsp() {
        return sldPrefix(this.doc);
    }
    get showLabels() {
        return this._showLabels;
    }
    get showIeds() {
        return this._showIeds;
    }
    zoomIn() {
        this.gridSize += 3;
    }
    zoomOut() {
        this.gridSize -= 3;
        if (this.gridSize < 2) {
            this.gridSize = 2;
        }
    }
    async startBayTypicalPlacing({ bayTypical, ieds, }) {
        const result = await this.sldEditor?.handleStartInteraction({
            mode: 'placing',
            element: bayTypical,
        });
        if (result) {
            const scl = this.doc.querySelector('SCL');
            ieds.forEach((ied) => {
                this.dispatchEvent(newEditEventV2(withSldNamespace(this.doc, insertIed(scl, ied))));
            });
        }
    }
    willUpdate(changedProperties) {
        if (!changedProperties.has('doc')) {
            return;
        }
        [
            'Substation',
            'VoltageLevel',
            'Bay',
            'ConductingEquipment',
            'PowerTransformer',
            'TransformerWinding',
        ].forEach((tag) => {
            this.templateElements[tag] = this.doc.createElementNS(this.doc.documentElement.namespaceURI, tag);
        });
        this.templateElements.BusBar = makeBusBar(this.doc, this.nsp);
    }
    convertSldAttributes() {
        const convertEdits = convertSldLayout(this.doc, this.nsp);
        this.dispatchEvent(newEditEventV2(withSldNamespace(this.doc, convertEdits)));
    }
    handleInAction(active) {
        this.inAction = active;
    }
    render() {
        if (!this.doc) {
            return html `<p>Please open an SCL document</p>`;
        }
        if (hasOldNamespace(this.doc)) {
            return html `<sld-migration-notice
        @sld-convert=${() => this.convertSldAttributes()}
      ></sld-migration-notice>`;
        }
        return html `<main>
      <sld-toolbar
        .doc=${this.doc}
        .docVersion=${this.docVersion}
        .templateElements=${this.templateElements}
        .inAction=${this.inAction}
        .gridSize=${this.gridSize}
        @oscd-edit-v2=${this.normalizeEditsWithSldNS}
        @oscd-sld-start-interaction=${({ detail }) => {
            this.sldEditor?.handleStartInteraction(detail);
        }}
        @start-placing-typical=${({ detail }) => {
            this.startBayTypicalPlacing(detail);
        }}
        @view-change=${({ detail, }) => {
            this._showLabels = detail.showLabels;
            this._showIeds = detail.showIeds;
        }}
        @zoom=${({ detail, }) => {
            if (detail.direction === 'in') {
                this.zoomIn();
            }
            else {
                this.zoomOut();
            }
        }}
        @cancel=${() => this.sldEditor?.cancelInteraction()}
      ></sld-toolbar>
      <sld-editor
        .doc="${this.doc}"
        .docVersion=${this.docVersion}
        .gridSize=${this.gridSize}
        .showLabels=${this.showLabels}
        .showIeds=${this.showIeds}
        @oscd-edit-v2=${this.normalizeEditsWithSldNS}
        @oscd-sld-in-action=${({ detail }) => {
            this.handleInAction(detail);
        }}
      >
      </sld-editor>
    </main>`;
    }
}
OscdEditorSld.scopedElements = {
    'sld-editor': SldEditor,
    'sld-toolbar': SldToolbar,
    'sld-migration-notice': SldMigrationNotice,
};
OscdEditorSld.styles = [
    sldThemeStyles,
    css `
    :host {
      display: block;
      container-type: inline-size;
    }

    main {
      padding: 16px;
      width: fit-content;
    }

    div {
      margin-top: 12px;
    }
  `,
];
export default OscdEditorSld;
__decorate([
    property({ type: Object })
], OscdEditorSld.prototype, "doc", void 0);
__decorate([
    property({ type: Number })
], OscdEditorSld.prototype, "docVersion", void 0);
__decorate([
    state()
], OscdEditorSld.prototype, "gridSize", void 0);
__decorate([
    state()
], OscdEditorSld.prototype, "templateElements", void 0);
__decorate([
    state()
], OscdEditorSld.prototype, "inAction", void 0);
__decorate([
    state()
], OscdEditorSld.prototype, "_showLabels", void 0);
__decorate([
    state()
], OscdEditorSld.prototype, "_showIeds", void 0);
__decorate([
    query('sld-editor')
], OscdEditorSld.prototype, "sldEditor", void 0);
//# sourceMappingURL=oscd-editor-sld.js.map