import { __decorate } from "tslib";
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdIconButton } from '@omicronenergy/oscd-ui/iconbutton/OscdIconButton.js';
import { resizePath } from './drawing/diagram-symbols.js';
import { sldThemeStyles } from './theme.js';
import { svgNs } from './foundations.js';
import { newSclEditDialogEvent, newSubstationDeleteEvent, newSubstationExportEvent, newSubstationResizeEvent, } from './foundations/events.js';
/**
 * Editor-owned chrome for a single substation: its name plus the
 * Edit / Resize / Delete / Export commands. Rendered by `SldEditor` and slotted
 * into `SldSubstationViewer`'s `header` slot so the viewer stays free of
 * editing concerns. Reports intent only — the editor decides what each command
 * means (Export is delegated back to the viewer, which owns the SVG).
 */
export class SldSubstationHeader extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this.disabled = false;
    }
    render() {
        return html `<h2 class="${classMap({ disabled: this.disabled })}">
      ${this.substation.getAttribute('name')}
      <oscd-icon-button
        label="Edit Substation"
        title="Edit Substation"
        @click=${() => this.dispatchEvent(newSclEditDialogEvent(this.substation))}
      >
        <oscd-icon>edit</oscd-icon>
      </oscd-icon-button>
      <oscd-icon-button
        label="Resize Substation"
        title="Resize Substation"
        @click=${() => this.dispatchEvent(newSubstationResizeEvent(this.substation))}
      >
        <svg
          xmlns="${svgNs}"
          width="24"
          height="24"
          viewBox="0 96 960 960"
          opacity="0.83"
          fill="currentColor"
        >
          ${resizePath}
        </svg>
      </oscd-icon-button>
      <oscd-icon-button
        label="Delete Substation"
        title="Delete Substation"
        @click=${() => this.dispatchEvent(newSubstationDeleteEvent(this.substation))}
      >
        <oscd-icon>delete</oscd-icon>
      </oscd-icon-button>
      <oscd-icon-button
        label="Export Single Line Diagram SVG"
        title="Export Single Line Diagram SVG"
        @click=${() => this.dispatchEvent(newSubstationExportEvent(this.substation))}
      >
        <oscd-icon>file_download</oscd-icon>
      </oscd-icon-button>
    </h2>`;
    }
}
SldSubstationHeader.scopedElements = {
    'oscd-icon': OscdIcon,
    'oscd-icon-button': OscdIconButton,
};
SldSubstationHeader.styles = [
    sldThemeStyles,
    css `
      h2 {
        font-family: Roboto;
        font-weight: 300;
        font-size: 24px;
        margin-bottom: 4px;
        color: var(--md-sys-color-on-surface, var(--oscd-base00));
        --md-icon-button-state-layer-height: 28px;
        --md-icon-button-state-layer-width: 28px;
        --md-icon-button-icon-size: 24px;
      }

      h2.disabled {
        pointer-events: none;
        opacity: 0.2;
      }

      * {
        user-select: none;
      }
    `,
];
__decorate([
    property({ attribute: false })
], SldSubstationHeader.prototype, "substation", void 0);
__decorate([
    property({ type: Boolean })
], SldSubstationHeader.prototype, "disabled", void 0);
//# sourceMappingURL=sld-substation-header.js.map