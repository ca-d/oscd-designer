import { __decorate } from "tslib";
import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { OscdIconButton } from '@omicronenergy/oscd-ui/iconbutton/OscdIconButton.js';
import { OscdFilledButton } from '@omicronenergy/oscd-ui/button/OscdFilledButton.js';
import { resizePath } from './drawing/diagram-symbols.js';
import { sldThemeStyles } from './theme.js';
import { svgNs } from './foundations.js';
import { newSclEditDialogEvent, newSubstationAutoLayoutEvent, newSubstationDeleteEvent, newSubstationExportEvent, newSubstationResizeEvent, } from './foundations/events.js';
/**
 * Editor-owned chrome for a single substation: its name plus the
 * Resize / Export / Edit / Delete commands. Rendered by `SldEditor` and slotted
 * into `SldSubstationViewer`'s `header` slot so the viewer stays free of
 * editing concerns. Reports intent only — the editor decides what each command
 * means (Export is delegated back to the viewer, which owns the SVG).
 */
export class SldSubstationHeader extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this.disabled = false;
        /** Nothing in the substation has been placed yet. */
        this.needsLayout = false;
    }
    render() {
        return html `<h2 class="${classMap({ disabled: this.disabled })}">
      ${this.substation.getAttribute('name')}
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
        label="Export Single Line Diagram SVG"
        title="Export Single Line Diagram SVG"
        @click=${() => this.dispatchEvent(newSubstationExportEvent(this.substation))}
      >
        <oscd-icon>file_download</oscd-icon>
      </oscd-icon-button>
      <oscd-icon-button
        label="Edit Substation"
        title="Edit Substation"
        @click=${() => this.dispatchEvent(newSclEditDialogEvent(this.substation))}
      >
        <oscd-icon>edit</oscd-icon>
      </oscd-icon-button>
      <oscd-icon-button
        label="Delete Substation"
        title="Delete Substation"
        @click=${() => this.dispatchEvent(newSubstationDeleteEvent(this.substation))}
      >
        <oscd-icon>delete</oscd-icon>
      </oscd-icon-button>
    </h2>${this.needsLayout && !this.disabled
            ? html `<div class="layout">
          <span>Nothing in this substation has been placed yet.</span>
          <oscd-filled-button
            @click=${() => this.dispatchEvent(newSubstationAutoLayoutEvent(this.substation))}
            >Lay out automatically</oscd-filled-button
          >
        </div>`
            : nothing}`;
    }
}
SldSubstationHeader.scopedElements = {
    'oscd-filled-button': OscdFilledButton,
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

      .layout {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
        font-family: Roboto;
        color: var(--md-sys-color-on-surface, var(--oscd-base00));
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
__decorate([
    property({ type: Boolean })
], SldSubstationHeader.prototype, "needsLayout", void 0);
//# sourceMappingURL=sld-substation-header.js.map