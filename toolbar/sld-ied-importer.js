import { __decorate } from "tslib";
import { LitElement, html, css } from 'lit';
import { query } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { newEditEventV2 } from '@openscd/oscd-api/utils.js';
import { OscdFab } from '@omicronenergy/oscd-ui/fab/OscdFab.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { convertSldLayout } from '../converter.js';
import { defaultSldNsPrefix } from '../foundations.js';
function newStartPlacingTypicalEvent(bayTypical, ieds) {
    return new CustomEvent('start-placing-typical', {
        bubbles: true,
        composed: true,
        detail: { bayTypical, ieds },
    });
}
/**
 * A FAB that opens a file picker for importing a Bay typical SCL file.
 * Parses the file, converts SLD layout attributes, and dispatches events
 * for the edit and the placement.
 */
export class SldIedImporter extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this.nsp = defaultSldNsPrefix;
    }
    async handleFileChange(event) {
        const file = event.target?.files?.item(0);
        if (!file) {
            return;
        }
        const fileBlob = await file.text();
        const bayTypicalDoc = new DOMParser().parseFromString(fileBlob, 'application/xml');
        const convertEdits = convertSldLayout(bayTypicalDoc, this.nsp);
        this.dispatchEvent(newEditEventV2(convertEdits));
        const bayTypical = bayTypicalDoc.querySelector('Bay');
        if (bayTypical) {
            const ieds = Array.from(bayTypicalDoc.querySelectorAll(':root > IED'));
            this.dispatchEvent(newStartPlacingTypicalEvent(bayTypical, ieds));
        }
        if (this.fileInput) {
            this.fileInput.value = '';
        }
    }
    render() {
        return html `<oscd-fab
      size="small"
      aria-label="Import Bay Typical"
      title="Import Bay Typical"
      @click=${(evt) => {
            evt.stopImmediatePropagation();
            this.fileInput?.click();
        }}
      ><oscd-icon slot="icon">upload_file</oscd-icon>
      <input type="file" @change="${this.handleFileChange}" />
    </oscd-fab>`;
    }
}
SldIedImporter.scopedElements = {
    'oscd-fab': OscdFab,
    'oscd-icon': OscdIcon,
};
SldIedImporter.styles = css `
    input {
      display: none;
    }
  `;
__decorate([
    query('input')
], SldIedImporter.prototype, "fileInput", void 0);
//# sourceMappingURL=sld-ied-importer.js.map