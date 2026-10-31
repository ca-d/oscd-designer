import { __decorate } from "tslib";
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { interactionReadout, } from './foundations/interaction-readout.js';
import { sldThemeStyles } from './theme.js';
/**
 * Placement/resize coordinate read-out, painted as a fixed-position DOM overlay
 * that follows the cursor. A single instance serves every substation.
 *
 * The component owns its own high-frequency state: on each pointer move it finds
 * the substation coordinate surface under the cursor (via `substationOf`),
 * converts the cursor position into that surface's grid coordinates through the
 * surface's CTM, and recomputes its text. Only the low-frequency interaction
 * state (what is being placed/resized) is fed in as the single `interaction`
 * property, so a moving cursor re-renders nothing but this component.
 */
export class SldCoordinateTooltip extends LitElement {
    constructor() {
        super(...arguments);
        /**
         * The controller-owned interaction gesture, projected down from the editor.
         * The tooltip reads it directly rather than receiving fanned-out slices, so
         * illegal gesture combinations stay unrepresentable.
         */
        this.interaction = { mode: 'idle' };
        this.readout = {
            text: '',
            invalid: false,
            hidden: true,
        };
        this.track = (event) => {
            if (this.coordinates) {
                this.coordinates.style.top = `${event.clientY}px`;
                this.coordinates.style.left = `${event.clientX + 16}px`;
            }
            this.readout = this.deriveReadout(event);
        };
    }
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('pointermove', this.track);
        window.addEventListener('click', this.track);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('pointermove', this.track);
        window.removeEventListener('click', this.track);
    }
    deriveReadout(event) {
        const surface = this.surfaceUnder(event);
        if (!surface) {
            return { text: '', invalid: false, hidden: true };
        }
        const { element, substation } = surface;
        const [mouseX, mouseY] = this.gridCoordinates(element, event.clientX, event.clientY);
        return interactionReadout({
            substation,
            interaction: this.interaction,
            mouseX,
            mouseY,
        });
    }
    surfaceUnder(event) {
        for (const target of event.composedPath()) {
            if (!(target instanceof SVGGraphicsElement)) {
                continue;
            }
            const substation = this.substationOf?.(target);
            if (substation) {
                return { element: target, substation };
            }
        }
        return undefined;
    }
    gridCoordinates(surface, clientX, clientY) {
        const point = new DOMPoint(clientX, clientY);
        const { x, y } = point.matrixTransform(surface.getScreenCTM().inverse());
        return [Math.floor(Math.max(0, x)), Math.floor(Math.max(0, y))];
    }
    render() {
        return html `<div
      class="${classMap({
            coordinates: true,
            invalid: this.readout.invalid,
            hidden: this.readout.hidden,
        })}"
    >
      (${this.readout.text})
    </div>`;
    }
}
SldCoordinateTooltip.styles = [
    sldThemeStyles,
    css `
    .hidden {
      display: none;
    }

    .coordinates {
      position: fixed;
      pointer-events: none;
      font-size: 16px;
      font-family: 'Roboto', sans-serif;
      padding: 8px;
      border-radius: 16px;
      background: var(--oscd-sld-tooltip-background-color);
      color: var(--md-sys-color-on-surface, var(--oscd-base00));
    }

    .coordinates.invalid {
      color: var(--oscd-sld-invalid-placement-color);
    }
  `,
];
__decorate([
    property({ attribute: false })
], SldCoordinateTooltip.prototype, "interaction", void 0);
__decorate([
    property({ attribute: false })
], SldCoordinateTooltip.prototype, "substationOf", void 0);
__decorate([
    state()
], SldCoordinateTooltip.prototype, "readout", void 0);
__decorate([
    query('.coordinates')
], SldCoordinateTooltip.prototype, "coordinates", void 0);
//# sourceMappingURL=sld-coordinate-tooltip.js.map