import { nothing, svg } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { identity } from '@openscd/scl-lib';
import { isBusBar } from '../../foundations/connectivity.js';
import { isIedReferenceElement } from '../../foundations/ied.js';
import { attributes } from '../../foundations/sld-attributes.js';
import { newEditIedEvent, newSclEditDialogEvent, newSelectEvent, newStartInteractionEvent, } from '../../foundations/events.js';
import { sldNs } from '../../foundations.js';
import { isSelectable } from './highlight.js';
import { isMode } from '../../foundations/interaction-mode.js';
function preventDefault(e) {
    if (e.button === 1) {
        e.preventDefault();
    }
}
function labelText(element, ied, x) {
    if (element.tagName !== 'Text') {
        return (element.getAttribute('name') ||
            ied?.getAttribute('name') ||
            element.getAttributeNS(sldNs, 'name'));
    }
    return element.textContent?.split(/\r?\n/).map((line, i) => svg `<tspan
      alignment-baseline="central"
      x="${x + 0.1}"
      dy="${i === 0 ? nothing : '1.19em'}"
      visibility="${line ? nothing : 'hidden'}"
    >
      ${line || '.'}
    </tspan>`);
}
export function renderLabel(element, context, { preview = false } = {}) {
    if (!context.view.showLabels) {
        return nothing;
    }
    if (context.view.showIeds === false && isIedReferenceElement(element)) {
        return nothing;
    }
    let deg = 0;
    let weight = 400;
    let color = 'var(--md-sys-color-on-surface, var(--oscd-base00))';
    const [x, y] = context.renderedLabelPosition(element, { preview });
    const ied = context.resolveIed(element);
    let text = labelText(element, ied, x);
    if (element.tagName === 'Text') {
        const { weight: textWeight, color: textColor, rot } = attributes(element);
        weight = textWeight;
        color = textColor;
        deg = rot * 90;
        if (!element.textContent) {
            text = '<Middle click to edit>';
            color = 'var(--oscd-sld-label-placeholder-color)';
            weight = 500;
        }
    }
    if (isIedReferenceElement(element) &&
        !isMode(context.interaction, 'placing', 'placingLabel')) {
        color = ied ? color : 'var(--oscd-sld-unresolved-reference-color)';
    }
    const fontSize = element.tagName === 'ConductingEquipment' ? 0.45 : 0.6;
    let events = 'none';
    let handleClick = nothing;
    if (isMode(context.interaction, 'idle') && !context.disabled) {
        events = 'all';
        handleClick = (event) => {
            const [mouseX2, mouseY2] = context.halfGridPosition(event);
            const offset = [mouseX2 - x - 0.5, mouseY2 - y + 0.5];
            context.dispatch(newStartInteractionEvent({ mode: 'placingLabel', element, offset }));
        };
    }
    else if (context.disabled && isSelectable(element, context.selectable)) {
        events = 'all';
        handleClick = () => context.dispatch(newSelectEvent(element));
    }
    let auxclick = nothing;
    if (!context.disabled) {
        auxclick = (e) => {
            if (e.button === 1) {
                if (!isIedReferenceElement(element)) {
                    context.dispatch(newSclEditDialogEvent(element));
                }
                else if (ied) {
                    context.dispatch(newEditIedEvent(ied));
                }
                e.preventDefault();
            }
        };
    }
    let contextmenu = nothing;
    if (!context.disabled) {
        contextmenu = (e) => {
            e.preventDefault();
            if (!isMode(context.interaction, 'idle')) {
                return;
            }
            context.requestContextMenu(element, e);
        };
    }
    let id = nothing;
    if (element.closest('Substation') === context.substation) {
        if (element.localName !== 'Text' && !isIedReferenceElement(element)) {
            id = `${identity(element)}`;
        }
        if (isIedReferenceElement(element)) {
            id = `${ied?.getAttribute('name') ?? ''}`;
        }
    }
    const classes = classMap({
        label: true,
        container: (element.tagName === 'Bay' && !isBusBar(element)) ||
            element.tagName === 'VoltageLevel',
        disabled: context.disabled,
        selectable: isSelectable(element, context.selectable),
    });
    return svg `<g
    class="${classes}"
    id="label:${id}"
    transform="rotate(${deg} ${x + 0.5} ${y - 0.5})"
  >
    <text
      x="${x + 0.1}"
      y="${y - 0.5}"
      alignment-baseline="central"
      @mousedown=${preventDefault}
      @auxclick=${auxclick}
      @click=${handleClick}
      @contextmenu=${contextmenu}
      pointer-events="${events}"
      font-weight="${weight}"
      font-size="${fontSize}px"
      font-family="Roboto, sans-serif"
      style="fill: ${color}; cursor: default;"
    >
      ${text}
    </text>
  </g>`;
}
//# sourceMappingURL=label.js.map