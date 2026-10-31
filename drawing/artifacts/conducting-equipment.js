import { nothing, svg } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { identity } from '@openscd/scl-lib';
import { eqRingPath } from '../diagram-symbols.js';
import { containsRect } from '../../foundations/element-geometry.js';
import { canPlaceAt } from '../../foundations/sld-placement.js';
import { connectionStartPoints, isBusBar, } from '../../foundations/connectivity.js';
import { attributes } from '../../foundations/sld-attributes.js';
import { isEqType, ringedEqTypes, singleTerminal, } from '../../foundations/equipment.js';
import { newPlaceEvent, newRotateEvent, newSelectEvent, newStartInteractionEvent, } from '../../foundations/events.js';
import { getHighlightStyle, isSelectable, isToBeHighlighted, } from './highlight.js';
import { renderLabel } from './label.js';
import { connectDetail, isMode, targetInMode, } from '../../foundations/interaction-mode.js';
function preventDefault(e) {
    if (e.button === 1) {
        e.preventDefault();
    }
}
function equipmentRenderState(equipment, context, { preview = false, connect = false } = {}) {
    if (targetInMode(context.interaction, 'placing') === equipment && !preview) {
        return undefined;
    }
    if (connectDetail(context.interaction)?.from.closest('Substation') ===
        context.substation &&
        !connect) {
        return undefined;
    }
    const [x, y] = context.renderedPosition(equipment);
    const eqType = equipment.getAttribute('type');
    const terminals = Array.from(equipment.children).filter(c => c.tagName === 'Terminal');
    const topTerminal = terminals.find(t => t.getAttribute('name') === 'T1');
    const bottomTerminal = terminals.find(t => t.getAttribute('name') !== 'T1');
    const placingTarget = targetInMode(context.interaction, 'placing');
    const placingOtherElement = !!placingTarget && placingTarget !== equipment;
    const connectingFromSelf = targetInMode(context.interaction, 'connectingFrom') === equipment;
    const selectable = isSelectable(equipment, context.selectable);
    const highlightedStyle = isToBeHighlighted(equipment, context.highlight)
        ? getHighlightStyle(equipment, context.highlight)
        : undefined;
    return {
        bottomGrounded: bottomTerminal?.getAttribute('cNodeName') === 'grounded',
        canShowBottomPort: !(bottomTerminal ||
            isMode(context.interaction, 'locked', 'resizingBR', 'resizingTL', 'connectingFrom', 'placingLabel') ||
            placingOtherElement ||
            singleTerminal.has(eqType) ||
            context.disabled),
        canShowTopPort: !(topTerminal ||
            isMode(context.interaction, 'locked', 'resizingBR', 'resizingTL', 'connectingFrom', 'placingLabel') ||
            placingOtherElement ||
            context.disabled),
        clickthrough: connect ||
            (!isMode(context.interaction, 'idle') && placingTarget !== equipment) ||
            (context.disabled && !selectable),
        diagramElementId: equipment.closest('Substation') === context.substation
            ? `${identity(equipment)}`
            : undefined,
        disabled: context.disabled,
        highlightedStyle,
        placingSelf: placingTarget === equipment,
        portPointerEventsDisabled: isMode(context.interaction, 'placing'),
        position: [x, y],
        selectable,
        showBottomConnectIndicator: isMode(context.interaction, 'connectingFrom') &&
            !connectingFromSelf &&
            !(context.mouseX === x &&
                context.mouseY === y &&
                context.nearestOpenTerminal(equipment) === 'T2') &&
            !bottomTerminal &&
            !singleTerminal.has(eqType) &&
            !context.disabled,
        showTopConnectIndicator: isMode(context.interaction, 'connectingFrom') &&
            !connectingFromSelf &&
            !(context.mouseX === x &&
                context.mouseY === y &&
                context.nearestOpenTerminal(equipment) === 'T1') &&
            !topTerminal &&
            !context.disabled,
        topGrounded: topTerminal?.getAttribute('cNodeName') === 'grounded',
    };
}
function equipmentRenderActions(equipment, context, state) {
    let handleClick = (e) => {
        context.dispatch(newStartInteractionEvent({
            mode: 'placing',
            element: equipment,
            copy: e.shiftKey,
        }));
    };
    if (targetInMode(context.interaction, 'placing') === equipment) {
        const [x, y] = state.position;
        const parent = Array.from(context.substation.querySelectorAll(':root > Substation > VoltageLevel > Bay')).find(bay => !isBusBar(bay) && containsRect(bay, x, y, 1, 1));
        if (parent && canPlaceAt(context.substation, equipment, x, y, 1, 1)) {
            handleClick = () => {
                context.dispatch(newPlaceEvent({
                    x,
                    y,
                    element: equipment,
                    parent,
                }));
            };
        }
    }
    if (context.disabled && !state.selectable) {
        handleClick = () => { };
    }
    if (context.disabled && state.selectable) {
        handleClick = () => {
            context.dispatch(newSelectEvent(equipment));
        };
    }
    return {
        onAuxClick: (e) => {
            if (context.disabled) {
                return;
            }
            if (e.button === 1) {
                // middle mouse button
                context.dispatch(newRotateEvent(equipment));
                e.preventDefault();
            }
        },
        onClick: handleClick,
        onContextMenu: (e) => {
            e.preventDefault();
            if (!isMode(context.interaction, 'idle') || context.disabled) {
                return;
            }
            context.requestContextMenu(equipment, e);
        },
        onGroundBottom: (e) => {
            e.preventDefault();
            context.groundTerminal(equipment, 'T2');
        },
        onGroundTop: (e) => {
            e.preventDefault();
            context.groundTerminal(equipment, 'T1');
        },
        onMouseDown: preventDefault,
        onStartBottomConnect: () => {
            context.dispatch(newStartInteractionEvent({
                mode: 'connecting',
                from: equipment,
                fromTerminal: 'T2',
                path: connectionStartPoints(equipment).T2,
            }));
        },
        onStartTopConnect: () => {
            context.dispatch(newStartInteractionEvent({
                mode: 'connecting',
                from: equipment,
                fromTerminal: 'T1',
                path: connectionStartPoints(equipment).T1,
            }));
        },
    };
}
function renderEquipmentPreviewLabels(equipment, context, { preview = false } = {}) {
    return preview
        ? svg `<g class="preview">
        ${[
            renderLabel(equipment, context, { preview }),
            ...Array.from(equipment.querySelectorAll('Text')).map(text => renderLabel(text, context, { preview })),
        ]}
      </g>`
        : nothing;
}
function renderEquipment(equipment, state, actions) {
    const [x, y] = state.position;
    const { flip, rot } = attributes(equipment);
    const deg = 90 * rot;
    const eqType = equipment.getAttribute('type');
    const ringed = ringedEqTypes.has(eqType);
    const symbol = isEqType(eqType) ? eqType : 'ConductingEquipment';
    const icon = ringed
        ? svg `<svg
        viewBox="0 0 25 25"
        width="1"
        height="1"
      >
        ${eqRingPath}
      </svg>`
        : svg `<use
        href="#${symbol}"
        xlink:href="#${symbol}"
        pointer-events="none"
      />`;
    const topConnector = state.canShowTopPort
        ? svg `<circle
        class="port"
        cx="0.5"
        cy="0"
        r="0.2"
        opacity="0.4"
        style="fill: var(--oscd-sld-terminal-color); stroke: var(--oscd-sld-terminal-outline-color)"
        pointer-events="${state.portPointerEventsDisabled ? 'none' : nothing}"
        @click=${actions.onStartTopConnect}
        @contextmenu=${actions.onGroundTop}
      />`
        : nothing;
    const topIndicator = state.showTopConnectIndicator
        ? svg `<polygon
        points="0.3,0 0.7,0 0.5,0.4"
        style="fill: var(--oscd-sld-terminal-color)"
        opacity="0.4"
      />`
        : nothing;
    const topGrounded = state.topGrounded
        ? svg `<line
        x1="0.5"
        y1="-0.1"
        x2="0.5"
        y2="0.16"
        stroke="currentColor"
        stroke-width="0.06"
        marker-start="url(#grounded)"
      />`
        : nothing;
    const bottomConnector = state.canShowBottomPort
        ? svg `<circle
        class="port"
        cx="0.5"
        cy="1"
        r="0.2"
        opacity="0.4"
        style="fill: var(--oscd-sld-terminal-color); stroke: var(--oscd-sld-terminal-outline-color)"
        pointer-events="${state.portPointerEventsDisabled ? 'none' : nothing}"
        @click=${actions.onStartBottomConnect}
        @contextmenu=${actions.onGroundBottom}
      />`
        : nothing;
    const bottomIndicator = state.showBottomConnectIndicator
        ? svg `<polygon
        points="0.3,1 0.7,1 0.5,0.6"
        style="fill: var(--oscd-sld-terminal-color)"
        opacity="0.4"
      />`
        : nothing;
    const bottomGrounded = state.bottomGrounded
        ? svg `<line
        x1="0.5"
        y1="1.1"
        x2="0.5"
        y2="0.84"
        stroke="currentColor"
        stroke-width="0.06"
        marker-start="url(#grounded)"
      />`
        : nothing;
    const highlight = state.highlightedStyle
        ? svg `<rect
        x="${x}"
        y="${y}"
        width="1"
        height="1"
        style="${state.highlightedStyle}"
        pointer-events="none"
      />`
        : nothing;
    return svg `${highlight}<g
    class="${classMap({
        equipment: true,
        preview: state.placingSelf,
        disabled: state.disabled,
        selectable: state.selectable,
    })}"
    id="${state.diagramElementId ?? nothing}"
    transform="translate(${x} ${y}) rotate(${deg} 0.5 0.5)${flip ? ' scale(-1,1) translate(-1 0)' : ''}"
  >
    <title>${equipment.getAttribute('name')}</title>
    ${icon}
    ${ringed
        ? svg `<use
            transform="rotate(${-deg} 0.5 0.5)"
            pointer-events="none"
            href="#${symbol}"
            xlink:href="#${symbol}"
          />`
        : nothing}
    <rect
      width="1"
      height="1"
      fill="none"
      pointer-events="${state.clickthrough ? 'none' : 'all'}"
      @mousedown=${actions.onMouseDown}
      @click=${actions.onClick}
      @auxclick=${actions.onAuxClick}
      @contextmenu=${actions.onContextMenu}
    />
    ${topConnector}
    ${topIndicator}
    ${topGrounded}
    ${bottomConnector}
    ${bottomIndicator}
    ${bottomGrounded}
  </g>`;
}
export const conductingEquipmentArtifact = {
    actions: equipmentRenderActions,
    matches: element => element.tagName === 'ConductingEquipment',
    render: (element, state, actions, context, options) => svg `
    ${renderEquipment(element, state, actions)}
    ${renderEquipmentPreviewLabels(element, context, options)}
  `,
    state: equipmentRenderState,
};
//# sourceMappingURL=conducting-equipment.js.map