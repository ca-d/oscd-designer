import { nothing, svg, } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { identity } from '@openscd/scl-lib';
import { isBusBar } from '../../foundations/connectivity.js';
import { attributes, xmlBoolean } from '../../foundations/sld-attributes.js';
import { elbowCorner, extendConnectPointPaths, findIntersection, } from '../../foundations/geometry.js';
import { newConnectEvent, newPlaceEvent, newStartInteractionEvent, } from '../../foundations/events.js';
import { finishRoute } from '../../foundations/routing.js';
import { privType, sldNs } from '../../foundations.js';
import { connectDetail, isMode, targetInMode, } from '../../foundations/interaction-mode.js';
function preventDefault(e) {
    if (e.button === 1) {
        e.preventDefault();
    }
}
export function renderConnectivityNode(cNode, context) {
    const priv = cNode.querySelector(`Private[type="${privType}"]`);
    if (!priv) {
        return nothing;
    }
    const circles = [];
    const intersections = Object.entries(Array.from(priv.querySelectorAll('Vertex')).reduce((record, vertex) => {
        const ret = record;
        const key = JSON.stringify(context.renderedPosition(vertex));
        if (ret[key]) {
            ret[key].push(vertex);
        }
        else {
            ret[key] = [vertex];
        }
        return ret;
    }, {}))
        .filter(([_, vertices]) => vertices.length > 2 ||
        (vertices.length === 2 &&
            vertices.find(v => v.hasAttributeNS(sldNs, 'uuid'))))
        .map(([_, [vertex]]) => context.renderedPosition(vertex));
    intersections.forEach(([x, y]) => circles.push(svg `<circle fill="currentColor" cx="${x}" cy="${y}" r="0.15" />`));
    const lines = [];
    const sections = Array.from(priv.getElementsByTagNameNS(sldNs, 'Section'));
    const bay = cNode.closest('Bay');
    const targetSize = 0.5;
    const wirePointerEvents = !isMode(context.interaction, 'placing', 'locked') &&
        (!isMode(context.interaction, 'resizingBR') ||
            (targetInMode(context.interaction, 'resizingBR') === bay &&
                isBusBar(bay)))
        ? 'all'
        : 'none';
    sections.forEach((section) => {
        if (context.hiddenSections?.has(section)) {
            return;
        }
        const busBar = xmlBoolean(section.getAttributeNS(sldNs, 'bus'));
        // Plain wires only take clicks to be connected to, so they don't get in the way of equipment under them.
        const pointerEvents = busBar || isMode(context.interaction, 'connectingFrom')
            ? wirePointerEvents
            : 'none';
        const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
        let i = 0;
        while (i < vertices.length - 1) {
            const [x1, y1] = context.renderedPosition(vertices[i]);
            let [x2, y2] = context.renderedPosition(vertices[i + 1]);
            let handleClick = nothing;
            let handleAuxClick = nothing;
            let handleContextMenu = nothing;
            if (busBar && bay && !context.disabled) {
                const { pos: [x, y], } = attributes(bay);
                handleClick = (e) => {
                    const [mouseX, mouseY] = context.gridPosition(e);
                    context.dispatch(newStartInteractionEvent({
                        mode: 'placing',
                        element: bay,
                        offset: [mouseX - x, mouseY - y],
                    }));
                };
                handleAuxClick = ({ button }) => {
                    if (button === 1) {
                        context.dispatch(newStartInteractionEvent({ mode: 'resizingBR', element: bay }));
                    }
                };
                handleContextMenu = (e) => {
                    e.preventDefault();
                    if (!isMode(context.interaction, 'idle')) {
                        return;
                    }
                    context.requestContextMenu(bay, e);
                };
            }
            if (busBar && targetInMode(context.interaction, 'resizingBR') === bay && !context.disabled) {
                if (section !==
                    sections.find(s => xmlBoolean(s.getAttributeNS(sldNs, 'bus')))) {
                    return;
                }
                circles.length = 0;
                const { pos: [vX, vY], dim: [vW, vH], } = attributes(bay.parentElement);
                const maxX = vX + vW - 0.5;
                const maxY = vY + vH - 0.5;
                if (i === 0) {
                    const dx = Math.max(context.mouseX - x1, 0);
                    const dy = Math.max(context.mouseY - y1, 0);
                    if (dx > dy) {
                        x2 = Math.max(x1, Math.min(maxX, context.mouseX + 0.5));
                        y2 = y1;
                    }
                    else {
                        y2 = Math.max(y1, Math.min(maxY, context.mouseY + 0.5));
                        x2 = x1;
                    }
                    if (x1 === x2 && y1 === y2) {
                        if (x2 >= maxX) {
                            y2 += 1;
                        }
                        else {
                            x2 += 1;
                        }
                    }
                }
                handleClick = () => {
                    context.dispatch(newPlaceEvent({
                        parent: section,
                        element: vertices[vertices.length - 1],
                        x: x2,
                        y: y2,
                    }));
                };
                lines.push(svg `<rect x="${context.mouseX}" y="${context.mouseY}"
            width="1" height="1" fill="none" pointer-events="${pointerEvents}"
            @click=${handleClick} />`);
            }
            if (isMode(context.interaction, 'connectingFrom') && !context.disabled) {
                handleClick = () => {
                    const { from, path, fromTerminal } = connectDetail(context.interaction);
                    if (from
                        .closest('ConductingEquipment, PowerTransformer')
                        .querySelector(`[connectivityNode="${cNode.getAttribute('pathName')}"]`)) {
                        return;
                    }
                    // The connection meets the net where the route first reaches it, not
                    // where the user clicked on it.
                    if (context.routeToConnectivityNode) {
                        const route = context.routeToConnectivityNode(path, cNode);
                        if (!route) {
                            return;
                        }
                        context.dispatch(newConnectEvent({
                            from,
                            fromTerminal,
                            path: finishRoute(path, route),
                            to: cNode,
                        }));
                        return;
                    }
                    const cursor = [context.mouseX2, context.mouseY2];
                    // The final drawn segment approaches the busbar from the elbow bend,
                    // unless the elbow is degenerate (no bend, i.e. the bend coincides
                    // with the cursor) — then it approaches straight from the last fixed
                    // waypoint.
                    const approach = elbowCorner(path, cursor);
                    const lastFixed = path[path.length - 2];
                    const start = approach[0] === cursor[0] && approach[1] === cursor[1]
                        ? lastFixed
                        : approach;
                    // Clamp the endpoint onto the busbar line segment [x1,y1]-[x2,y2],
                    // then re-bend the elbow to reach that clamped point.
                    const endpoint = findIntersection(start, cursor, [x1, y1], [x2, y2]);
                    const corner = elbowCorner(path, endpoint);
                    const newPath = extendConnectPointPaths(path, corner, endpoint);
                    context.dispatch(newConnectEvent({
                        from,
                        fromTerminal,
                        path: newPath,
                        to: cNode,
                    }));
                };
            }
            lines.push(svg `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              pointer-events="${pointerEvents}"
              stroke-width="${busBar ? 0.12 : nothing}" stroke="currentColor"
              stroke-linecap="${busBar ? 'round' : 'square'}" />`);
            lines.push(svg `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              pointer-events="${pointerEvents}" stroke-width="${targetSize}"
              @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
              @click=${handleClick} @auxclick=${handleAuxClick} />`);
            if (busBar ||
                (isMode(context.interaction, 'connectingFrom') && !vertices[i].hasAttributeNS(sldNs, 'uuid'))) {
                lines.push(svg `<rect x="${x1 - targetSize / 2}" y="${y1 - targetSize / 2}"
                width="${targetSize}" height="${targetSize}"
                @click=${handleClick} @auxclick=${handleAuxClick}
                @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
                pointer-events="${pointerEvents}" fill="none" />`);
            }
            if (busBar ||
                (isMode(context.interaction, 'connectingFrom') && !vertices[i + 1].hasAttributeNS(sldNs, 'uuid'))) {
                lines.push(svg `<rect x="${x2 - targetSize / 2}" y="${y2 - targetSize / 2}"
                width="${targetSize}" height="${targetSize}"
                @click=${handleClick} @auxclick=${handleAuxClick}
                @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
                pointer-events="${pointerEvents}" fill="none" />`);
            }
            i += 1;
        }
    });
    const id = cNode.closest('Substation') === context.substation
        ? identity(cNode)
        : nothing;
    return svg `<g class="${classMap({
        node: true,
        disabled: context.disabled,
    })}" id="${id}" >
      <title>${cNode.getAttribute('pathName')}</title>
      ${circles}
      ${lines}
    </g>`;
}
//# sourceMappingURL=connectivity-node.js.map