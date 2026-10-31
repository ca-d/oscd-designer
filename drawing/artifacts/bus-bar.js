import { nothing, svg } from 'lit';
import { identity } from '@openscd/scl-lib';
import { containsRect } from '../../foundations/element-geometry.js';
import { isBusBar } from '../../foundations/connectivity.js';
import { attributes } from '../../foundations/sld-attributes.js';
import { newPlaceEvent } from '../../foundations/events.js';
import { isMode } from '../../foundations/interaction-mode.js';
import { renderConnectivityNode, } from './connectivity-node.js';
import { renderLabel } from './label.js';
function busBarState(busBar, context) {
    const [x, y] = context.renderedPosition(busBar);
    const { dim: [w, h], } = attributes(busBar);
    return {
        diagramElementId: busBar.closest('Substation') === context.substation
            ? String(identity(busBar))
            : undefined,
        dimensions: [w, h],
        position: [x, y],
    };
}
function busBarActions(busBar, context, state) {
    const [x, y] = state.position;
    const [w, h] = state.dimensions;
    if (context.disabled || isMode(context.interaction, 'locked')) {
        return { onClick: () => { } };
    }
    return {
        onClick: () => {
            const parent = Array.from(context.substation.querySelectorAll(':root > Substation > VoltageLevel')).find(vl => containsRect(vl, x, y, w, h));
            if (parent) {
                context.dispatch(newPlaceEvent({
                    x,
                    y,
                    element: busBar,
                    parent,
                }));
            }
        },
    };
}
function renderBusBar(busBar, state, actions, context) {
    const [x, y] = state.position;
    const [w, h] = state.dimensions;
    return svg `<g class="bus preview" id="${state.diagramElementId ?? nothing}">
    <title>${busBar.getAttribute('name')}</title>
    ${renderLabel(busBar, context)}
    ${Array.from(busBar.querySelectorAll('Text')).map(text => renderLabel(text, context))}
    ${renderConnectivityNode(busBar.querySelector('ConnectivityNode'), context)}
    <rect
      x="${x}"
      y="${y}"
      width="${w}"
      height="${h}"
      pointer-events="all"
      fill="none"
      @click=${actions.onClick}
    />
  </g>`;
}
export const busBarArtifact = {
    actions: busBarActions,
    matches: isBusBar,
    render: renderBusBar,
    state: busBarState,
};
//# sourceMappingURL=bus-bar.js.map