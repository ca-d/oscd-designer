import { nothing, render as litRender, svg } from 'lit';

import { attributes } from '../../foundations/sld-attributes.js';
import { svgNs } from '../../foundations.js';
import { newOpenContextMenuEvent } from '../../foundations/events.js';
import { resolveIed } from '../../foundations/ied.js';
import { idle } from '../../foundations/interaction-mode.js';

import type { EquipmentContext } from './conducting-equipment.js';
import type { PowerTransformerContext } from './power-transformer.js';
import type { BusBarContext } from './bus-bar.js';
import type { EquipmentContainerContext } from './equipment-container.js';

/**
 * A spy context satisfying every artifact context type. Dispatched events,
 * grounded terminals, opened context menus, and child renders are recorded for
 * assertions.
 */
export type SpyArtifactContext = EquipmentContext &
  PowerTransformerContext &
  BusBarContext &
  EquipmentContainerContext & {
    dispatched: Event[];
    grounded: { element: Element; terminal: string }[];
    renderedChildren: Element[];
  };

/**
 * Build a spy artifact context with neutral defaults (idle, enabled, nothing
 * placing). Pass `overrides` to set specific fields for a test. `renderedPosition`
 * and `renderedLabelPosition` default to the element's stored SLD coordinates.
 */
export function makeArtifactContext(
  overrides: Partial<SpyArtifactContext> = {},
): SpyArtifactContext {
  const dispatched: Event[] = [];
  const grounded: { element: Element; terminal: string }[] = [];
  const renderedChildren: Element[] = [];

  return {
    dispatched,
    grounded,
    renderedChildren,
    connectTarget: undefined,
    interaction: idle(),
    disabled: false,
    dispatch(event: Event) {
      dispatched.push(event);
    },
    gridPosition: ({ clientX, clientY }: MouseEvent) => [clientX, clientY],
    groundTerminal(element: Element, terminal: 'T1' | 'T2' | 'N1' | 'N2') {
      grounded.push({ element, terminal });
    },
    halfGridPosition: ({ clientX, clientY }: MouseEvent) => [clientX, clientY],
    highlight: [],
    mouseX: 0,
    mouseY: 0,
    mouseX2: 0,
    mouseY2: 0,
    nearestOpenTerminal: () => undefined,
    requestContextMenu(element: Element, event: MouseEvent) {
      const [gridX, gridY] = this.gridPosition(event);
      this.dispatch(
        newOpenContextMenuEvent({
          element,
          x: event.clientX,
          y: event.clientY,
          gridX,
          gridY,
        }),
      );
    },
    resolveIed: referencedIed => resolveIed(referencedIed),
    renderConnectivityNode: () => nothing,
    renderEquipment(element: Element) {
      renderedChildren.push(element);
      return svg``;
    },
    renderIed(element: Element) {
      renderedChildren.push(element);
      return svg``;
    },
    renderPowerTransformer(element: Element) {
      renderedChildren.push(element);
      return svg``;
    },
    renderedLabelPosition: (element: Element) => attributes(element).label,
    renderedPosition: (element: Element) => attributes(element).pos,
    selectable: [],
    substation: undefined as unknown as Element,
    svgCoordinates: (clientX: number, clientY: number) =>
      [clientX, clientY] as [number, number],
    view: { showLabels: true, showIeds: true },
    ...overrides,
  };
}

/** Render an artifact's `SVGTemplateResult` into a detached `<svg>` host. */
export function renderToSvg(
  template: ReturnType<typeof svg> | typeof nothing,
): SVGSVGElement {
  const host = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
  litRender(template, host);
  return host;
}
