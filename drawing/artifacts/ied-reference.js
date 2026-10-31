import { nothing, svg } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { containsRect } from '../../foundations/element-geometry.js';
import { canPlaceAt } from '../../foundations/sld-placement.js';
import { isIedReferenceElement } from '../../foundations/ied.js';
import { newPlaceEvent, newSelectEvent, newStartInteractionEvent, } from '../../foundations/events.js';
import { isSelectable } from './highlight.js';
import { renderLabel } from './label.js';
import { isMode, targetInMode } from '../../foundations/interaction-mode.js';
function preventDefault(e) {
    if (e.button === 1) {
        e.preventDefault();
    }
}
function iedReferenceState(referencedIed, context, { preview = false } = {}) {
    if (context.view.showIeds === false ||
        (targetInMode(context.interaction, 'placing') === referencedIed && !preview)) {
        return undefined;
    }
    const [x, y] = context.renderedPosition(referencedIed);
    const iedName = context.resolveIed(referencedIed)?.getAttribute('name') ?? null;
    return {
        clickthrough: !isMode(context.interaction, 'idle') && targetInMode(context.interaction, 'placing') !== referencedIed,
        diagramElementId: referencedIed.closest('Substation') === context.substation && iedName
            ? `IEDRef-${iedName}`
            : undefined,
        disabled: context.disabled,
        iedName,
        placingSelf: targetInMode(context.interaction, 'placing') === referencedIed,
        position: [x, y],
        selectable: isSelectable(referencedIed, context.selectable),
    };
}
function iedReferenceActions(referencedIed, context, state) {
    let handleClick = () => { };
    const [x, y] = state.position;
    if (targetInMode(context.interaction, 'placing') === referencedIed &&
        canPlaceAt(context.substation, referencedIed, x, y, 1, 1)) {
        handleClick = () => {
            const parent = Array.from(context.substation.querySelectorAll(':scope > VoltageLevel > Bay'))
                .concat(Array.from(context.substation.querySelectorAll(':scope > VoltageLevel')))
                .find(vlOrBay => containsRect(vlOrBay, x, y, 1, 1)) ||
                context.substation;
            context.dispatch(newPlaceEvent({
                x,
                y,
                element: referencedIed,
                parent,
            }));
        };
    }
    else if (context.disabled && state.selectable) {
        handleClick = () => context.dispatch(newSelectEvent(referencedIed));
    }
    else if (!isMode(context.interaction, 'idle') || context.disabled) {
        handleClick = () => { };
    }
    else {
        handleClick = () => context.dispatch(newStartInteractionEvent({ mode: 'placing', element: referencedIed }));
    }
    return {
        onClick: handleClick,
        onContextMenu: (e) => {
            e.preventDefault();
            if (!isMode(context.interaction, 'idle') || context.disabled) {
                return;
            }
            context.requestContextMenu(referencedIed, e);
        },
        onMouseDown: preventDefault,
    };
}
function renderIedReference(_referencedIed, state, actions) {
    const [x, y] = state.position;
    return svg `<g
    class="${classMap({
        ied: true,
        preview: state.placingSelf,
        disabled: state.disabled,
        selectable: state.selectable,
    })}"
    id="${state.diagramElementId ?? nothing}"
    transform="translate(${x} ${y})"
  >
    <title>${state.iedName}</title>
    <use href="#IED" xlink:href="#IED" pointer-events="none" />
    <rect
      width="1"
      height="1"
      fill="none"
      pointer-events="${state.clickthrough ? 'none' : 'all'}"
      @mousedown=${actions.onMouseDown}
      @click=${actions.onClick}
      @contextmenu=${actions.onContextMenu}
    />
  </g>`;
}
function renderIedReferencePreviewLabels(referencedIed, context, { preview = false } = {}) {
    return preview
        ? svg `<g class="preview">
        ${renderLabel(referencedIed, context, { preview })}
      </g>`
        : nothing;
}
export const iedReferenceArtifact = {
    actions: iedReferenceActions,
    matches: isIedReferenceElement,
    render: (element, state, actions, context, options) => svg `
    ${renderIedReference(element, state, actions)}
    ${renderIedReferencePreviewLabels(element, context, options)}
  `,
    state: iedReferenceState,
};
//# sourceMappingURL=ied-reference.js.map