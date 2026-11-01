import {
  nothing,
  svg,
  type SVGTemplateResult,
  type TemplateResult,
} from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { identity } from '@openscd/scl-lib';

import { attributes, xmlBoolean } from '../../foundations/sld-attributes.js';
import {
  elbowCorner,
  extendConnectPointPaths,
  findIntersection,
} from '../../foundations/geometry.js';
import {
  newConnectEvent,
  newStartInteractionEvent,
} from '../../foundations/events.js';
import { privType, sldNs } from '../../foundations.js';

import type { Point } from '../../foundations/geometry.js';
import type { SldSharedContext } from './artifact.js';
import { connectDetail, isMode } from '../../foundations/interaction-mode.js';

export type ConnectivityNodeContext = SldSharedContext & {
  mouseX: number;
  mouseY: number;
  mouseX2: number;
  mouseY2: number;
  /** Sections drawn elsewhere, e.g. as a live reroute preview. */
  hiddenSections?: Set<Element>;
  /** The connection being drawn, auto-routed to where it can meet `cNode`. */
  routeToConnectivityNode?: (
    path: Point[],
    cNode: Element,
  ) => Point[] | undefined;
};

function preventDefault(e: MouseEvent) {
  if (e.button === 1) {
    e.preventDefault();
  }
}

export function renderConnectivityNode(
  cNode: Element,
  context: ConnectivityNodeContext,
): SVGTemplateResult | typeof nothing {
  const priv = cNode.querySelector(`Private[type="${privType}"]`);
  if (!priv) {
    return nothing;
  }
  const circles = [] as TemplateResult<2>[];
  const intersections = Object.entries(
    Array.from(priv.querySelectorAll('Vertex'))
      // A bus bar drawn elsewhere as a preview leaves no junctions behind.
      .filter(
        vertex =>
          !(
            context.hiddenSections?.has(vertex.parentElement!) &&
            xmlBoolean(vertex.parentElement!.getAttributeNS(sldNs, 'bus'))
          ),
      )
      .reduce(
        (record, vertex) => {
          const ret = record;
          const key = JSON.stringify(context.renderedPosition(vertex));
          if (ret[key]) {
            ret[key].push(vertex);
          } else {
            ret[key] = [vertex];
          }
          return ret;
        },
        {} as Record<string, Element[]>,
      ),
  )
    .filter(
      ([_, vertices]) =>
        vertices.length > 2 ||
        (vertices.length === 2 &&
          vertices.find(v => v.hasAttributeNS(sldNs, 'uuid'))),
    )
    .map(([_, [vertex]]) => context.renderedPosition(vertex));
  intersections.forEach(([x, y]) =>
    circles.push(svg`<circle fill="currentColor" cx="${x}" cy="${y}" r="0.15" />`),
  );
  const lines = [] as TemplateResult<2>[];
  const sections = Array.from(priv.getElementsByTagNameNS(sldNs, 'Section'));
  const bay = cNode.closest('Bay');
  const targetSize = 0.6;
  const wirePointerEvents = isMode(
    context.interaction,
    'placing',
    'locked',
    'resizingBR',
    'resizingTL',
  )
    ? 'none'
    : 'all';
  sections.forEach((section) => {
    if (context.hiddenSections?.has(section)) {
      return;
    }
    const busBar = xmlBoolean(section.getAttributeNS(sldNs, 'bus'));
    // Plain wires take clicks to be connected to, or to be moved while idle.
    const pointerEvents =
      busBar || isMode(context.interaction, 'idle', 'connectingFrom')
        ? wirePointerEvents
        : 'none';
    const vertices = Array.from(
      section.getElementsByTagNameNS(sldNs, 'Vertex'),
    );
    let i = 0;
    while (i < vertices.length - 1) {
      const [x1, y1] = context.renderedPosition(vertices[i]);
      const [x2, y2] = context.renderedPosition(vertices[i + 1]);
      let handleClick: ((e: MouseEvent) => void) | symbol = nothing;
      let handleAuxClick: ((e: MouseEvent) => void) | symbol = nothing;
      let handleContextMenu: ((e: MouseEvent) => void) | symbol = nothing;
      if (busBar && bay && !context.disabled) {
        const {
          pos: [x, y],
        } = attributes(bay);
        handleClick = (e: MouseEvent) => {
          const [mouseX, mouseY] = context.gridPosition(e);
          context.dispatch(
            newStartInteractionEvent({
              mode: 'placing',
              element: bay,
              offset: [mouseX - x, mouseY - y],
            }),
          );
        };
        // The end of the bus bar nearer to the click is the one that is resized.
        handleAuxClick = (e: MouseEvent) => {
          if (e.button !== 1) {
            return;
          }
          const [mouseX, mouseY] = context.gridPosition(e);
          const {
            dim: [w, h],
          } = attributes(bay);
          const nearStart =
            Math.hypot(mouseX - x, mouseY - y) <
            Math.hypot(mouseX - (x + w - 1), mouseY - (y + h - 1));
          context.dispatch(
            newStartInteractionEvent({
              mode: nearStart ? 'resizingTL' : 'resizingBR',
              element: bay,
            }),
          );
        };
        handleContextMenu = (e: MouseEvent) => {
          e.preventDefault();
          if (!isMode(context.interaction, 'idle')) {
            return;
          }
          context.requestContextMenu(bay, e);
        };
      }
      if (!busBar && !context.disabled && isMode(context.interaction, 'idle')) {
        handleClick = (e: MouseEvent) => {
          e.stopPropagation();
          context.dispatch(
            newStartInteractionEvent({
              mode: 'reroutingSection',
              element: section,
            }),
          );
        };
      }
      if (isMode(context.interaction, 'connectingFrom') && !context.disabled) {
        handleClick = () => {
          const { from, path, fromTerminal } = connectDetail(context.interaction)!;
          if (
            from
              .closest('ConductingEquipment, PowerTransformer')!
              .querySelector(
                `[connectivityNode="${cNode.getAttribute('pathName')}"]`,
              )
          ) {
            return;
          }
          // The connection meets the net where the route first reaches it, not
          // where the user clicked on it.
          if (context.routeToConnectivityNode) {
            const routed = context.routeToConnectivityNode(path, cNode);
            if (!routed) {
              return;
            }
            context.dispatch(
              newConnectEvent({
                from,
                fromTerminal,
                path: routed,
                to: cNode,
              }),
            );
            return;
          }

          const cursor: Point = [context.mouseX2, context.mouseY2];

          // The final drawn segment approaches the busbar from the elbow bend,
          // unless the elbow is degenerate (no bend, i.e. the bend coincides
          // with the cursor) — then it approaches straight from the last fixed
          // waypoint.
          const approach = elbowCorner(path, cursor);
          const lastFixed = path[path.length - 2];
          const start =
            approach[0] === cursor[0] && approach[1] === cursor[1]
              ? lastFixed
              : approach;

          // Clamp the endpoint onto the busbar line segment [x1,y1]-[x2,y2],
          // then re-bend the elbow to reach that clamped point.
          const endpoint = findIntersection(start, cursor, [x1, y1], [x2, y2]);
          const corner = elbowCorner(path, endpoint);

          const newPath = extendConnectPointPaths(path, corner, endpoint);
          context.dispatch(
            newConnectEvent({
              from,
              fromTerminal,
              path: newPath,
              to: cNode,
            }),
          );
        };
      }

      lines.push(
        svg`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              pointer-events="${pointerEvents}"
              stroke-width="${busBar ? 0.12 : nothing}" stroke="currentColor"
              stroke-linecap="${busBar ? 'round' : 'square'}" />`,
      );
      lines.push(
        svg`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
              pointer-events="${pointerEvents}" stroke-width="${targetSize}"
              @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
              @click=${handleClick} @auxclick=${handleAuxClick} />`,
      );
      if (
        busBar ||
        (isMode(context.interaction, 'connectingFrom') && !vertices[i].hasAttributeNS(sldNs, 'uuid'))
      ) {
        lines.push(
          svg`<rect x="${x1 - targetSize / 2}" y="${y1 - targetSize / 2}"
                width="${targetSize}" height="${targetSize}"
                @click=${handleClick} @auxclick=${handleAuxClick}
                @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
                pointer-events="${pointerEvents}" fill="none" />`,
        );
      }
      if (
        busBar ||
        (isMode(context.interaction, 'connectingFrom') && !vertices[i + 1].hasAttributeNS(sldNs, 'uuid'))
      ) {
        lines.push(
          svg`<rect x="${x2 - targetSize / 2}" y="${y2 - targetSize / 2}"
                width="${targetSize}" height="${targetSize}"
                @click=${handleClick} @auxclick=${handleAuxClick}
                @contextmenu=${handleContextMenu} @mousedown=${preventDefault}
                pointer-events="${pointerEvents}" fill="none" />`,
        );
      }
      i += 1;
    }
  });
  const id =
    cNode.closest('Substation') === context.substation
      ? identity(cNode)
      : nothing;
  return svg`<g class="${classMap({
    node: true,
    disabled: context.disabled,
  })}" id="${id}" >
      <title>${cNode.getAttribute('pathName')}</title>
      ${circles}
      ${lines}
    </g>`;
}
