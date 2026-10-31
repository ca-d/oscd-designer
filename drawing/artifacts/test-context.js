import { nothing, render as litRender, svg } from 'lit';
import { attributes } from '../../foundations/sld-attributes.js';
import { svgNs } from '../../foundations.js';
import { newOpenContextMenuEvent } from '../../foundations/events.js';
import { resolveIed } from '../../foundations/ied.js';
import { idle } from '../../foundations/interaction-mode.js';
/**
 * Build a spy artifact context with neutral defaults (idle, enabled, nothing
 * placing). Pass `overrides` to set specific fields for a test. `renderedPosition`
 * and `renderedLabelPosition` default to the element's stored SLD coordinates.
 */
export function makeArtifactContext(overrides = {}) {
    const dispatched = [];
    const grounded = [];
    const renderedChildren = [];
    return {
        dispatched,
        grounded,
        renderedChildren,
        connectTarget: undefined,
        interaction: idle(),
        disabled: false,
        dispatch(event) {
            dispatched.push(event);
        },
        gridPosition: ({ clientX, clientY }) => [clientX, clientY],
        groundTerminal(element, terminal) {
            grounded.push({ element, terminal });
        },
        halfGridPosition: ({ clientX, clientY }) => [clientX, clientY],
        highlight: [],
        mouseX: 0,
        mouseY: 0,
        mouseX2: 0,
        mouseY2: 0,
        nearestOpenTerminal: () => undefined,
        requestContextMenu(element, event) {
            const [gridX, gridY] = this.gridPosition(event);
            this.dispatch(newOpenContextMenuEvent({
                element,
                x: event.clientX,
                y: event.clientY,
                gridX,
                gridY,
            }));
        },
        resolveIed: referencedIed => resolveIed(referencedIed),
        renderConnectivityNode: () => nothing,
        renderEquipment(element) {
            renderedChildren.push(element);
            return svg ``;
        },
        renderIed(element) {
            renderedChildren.push(element);
            return svg ``;
        },
        renderPowerTransformer(element) {
            renderedChildren.push(element);
            return svg ``;
        },
        renderedLabelPosition: (element) => attributes(element).label,
        renderedPosition: (element) => attributes(element).pos,
        selectable: [],
        substation: undefined,
        svgCoordinates: (clientX, clientY) => [clientX, clientY],
        view: { showLabels: true, showIeds: true },
        ...overrides,
    };
}
/** Render an artifact's `SVGTemplateResult` into a detached `<svg>` host. */
export function renderToSvg(template) {
    const host = document.createElementNS(svgNs, 'svg');
    litRender(template, host);
    return host;
}
//# sourceMappingURL=test-context.js.map