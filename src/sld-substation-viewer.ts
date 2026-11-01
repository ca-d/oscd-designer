import {
  css,
  html,
  nothing,
  LitElement,
  PropertyValues,
  svg,
  SVGTemplateResult,
} from 'lit';

import { property, query, state } from 'lit/decorators.js';
import { guard } from 'lit/directives/guard.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

import {
  symbols,
} from './drawing/diagram-symbols.js';
import {
  conductingEquipmentArtifact,
} from './drawing/artifacts/conducting-equipment.js';
import { busBarArtifact } from './drawing/artifacts/bus-bar.js';
import {
  iedReferenceArtifact,
} from './drawing/artifacts/ied-reference.js';
import { powerTransformerArtifact } from './drawing/artifacts/power-transformer.js';
import { renderLabel as renderArtifactLabel } from './drawing/artifacts/label.js';
import {
  renderConnectivityNode as renderArtifactConnectivityNode,
  type ConnectivityNodeContext,
} from './drawing/artifacts/connectivity-node.js';
import {
  renderVoltageLevel,
  renderBay,
  type EquipmentContainerContext,
} from './drawing/artifacts/equipment-container.js';
import type {
  ArtifactRenderOptions,
  SldArtifactDescriptor,
  SldSharedContext,
} from './drawing/artifacts/artifact.js';
import type { PowerTransformerContext } from './drawing/artifacts/power-transformer.js';
import type { EquipmentContext } from './drawing/artifacts/conducting-equipment.js';
import type { BusBarContext } from './drawing/artifacts/bus-bar.js';
import { leaveRects, obstacleRects } from './foundations/obstacles.js';
import { overlappedSections, planReroutes } from './foundations/rerouting.js';
import type { PlannedRoute } from './foundations/rerouting.js';
import {
  ConnectionRouter,
  connectAnchor,
  connectHeading,
  backtrackPath,
  extendRoute,
  finishRoute,
  snapApproachPoint,
} from './foundations/routing.js';
import type { RouterMode } from './foundations/routing.js';
import { containsRect } from './foundations/element-geometry.js';
import { canPlaceAt } from './foundations/sld-placement.js';
import { busBarLine, resizedBusBarRect } from './foundations/bus-bar-edits.js';
import {
  busSections,
  connectionStartPoints,
  isBusBar,
} from './foundations/connectivity.js';
import {
  attributes,
  getSLDAttributes,
  xmlBoolean,
} from './foundations/sld-attributes.js';
import { sldThemeStyles } from './theme.js';
import { singleTerminal } from './foundations/equipment.js';
import {
  iedReferences,
  isIedReferenceElement,
  resolveIed as resolveReferencedIed,
} from './foundations/ied.js';
import {
  newConnectEvent,
  newDismissRoutingWarningEvent,
  newExtendConnectPointEvent,
  newRerouteSectionEvent,
  newGroundTerminalEvent,
  newOpenContextMenuEvent,
  newPlaceEvent,
  newPlaceLabelEvent,
  newResizeEvent,
  newResizeTLEvent,
} from './foundations/events.js';
import { serializeForExport } from './foundations/export.js';
import { sldNs, sldPrefix, svgNs, xlinkNs } from './foundations.js';

import type { Point, Rect } from './foundations/geometry.js';
import type { InteractionState } from './foundations/interaction-mode.js';
import { connectDetail, isMode } from './foundations/interaction-mode.js';
import type {
  StartConnectDetail,
} from './foundations/events.js';
import type { Style } from './foundations/sld-attributes.js';

/** The wires of a connectivity node; terminals are where equipment attaches. */
function wirePolylines(
  cNode: Element,
): { points: Point[]; terminals: Point[]; bus: boolean }[] {
  return Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')).map(
    (section) => {
      const vertices = Array.from(
        section.getElementsByTagNameNS(sldNs, 'Vertex'),
      );
      return {
        bus: xmlBoolean(getSLDAttributes(section, 'bus')),
        points: vertices.map(vertex => attributes(vertex).pos),
        terminals: vertices
          .filter(vertex => vertex.hasAttributeNS(sldNs, 'uuid'))
          .map(vertex => attributes(vertex).pos),
      };
    },
  );
}

function isBay(element: Element) {
  return element.tagName === 'Bay' && !isBusBar(element);
}

const mouseCoordinateProperties: PropertyKey[] = [
  'mouseX',
  'mouseY',
  'mouseX2',
  'mouseY2',
  'mouseX2f',
  'mouseY2f',
];

/** A section as it would run after the placement; a `fallback` is drawn as a warning. */
type PreviewRoute = Pick<PlannedRoute, 'section' | 'points' | 'fallback'>;

/** An editor [[`plugin`]] for editing the `Substation` section. */

export class SldSubstationViewer extends ScopedElementsMixin(LitElement) {
  static scopedElements = {};

  @property()
  doc!: XMLDocument;

  @property()
  substation!: Element;

  @property()
  docVersion = -1;

  @property()
  gridSize = 32;

  get nsp(): string {
    return sldPrefix(this.doc);
  }

  @property({ attribute: false })
  interaction: InteractionState = { mode: 'locked' };

  /**
   * The following read-only getters project the single {@link interaction}
   * value into the per-gesture shapes the render layers and drawing artifacts
   * consume. The view stores no interaction state of its own — it derives these
   * from the one `interaction` property supplied by the controller.
   */
  get placing(): Element | undefined {
    return this.interaction.mode === 'placing'
      ? this.interaction.element
      : undefined;
  }

  get placingOffset(): Point {
    return this.interaction.mode === 'placing' ||
      this.interaction.mode === 'placingLabel'
      ? this.interaction.offset
      : [0, 0];
  }

  get placingLabel(): Element | undefined {
    return this.interaction.mode === 'placingLabel'
      ? this.interaction.element
      : undefined;
  }

  get resizingTL(): Element | undefined {
    return this.interaction.mode === 'resizingTL'
      ? this.interaction.element
      : undefined;
  }

  /** The bus bar being resized, and the end of it that follows the cursor. */
  private get resizingBusBar():
  | { bay: Element; handle: 'BR' | 'TL' }
  | undefined {
    const { interaction } = this;
    if (
      (interaction.mode === 'resizingBR' || interaction.mode === 'resizingTL') &&
      isBusBar(interaction.element) &&
      interaction.element.closest('Substation') === this.substation
    ) {
      return {
        bay: interaction.element,
        handle: interaction.mode === 'resizingBR' ? 'BR' : 'TL',
      };
    }
    return undefined;
  }

  /** The cells the bus bar being resized would cover with its end at the cursor. */
  private busBarResizeRect(): Rect | undefined {
    const resizing = this.resizingBusBar;
    return (
      resizing &&
      resizedBusBarRect(resizing.bay, resizing.handle, [this.mouseX, this.mouseY])
    );
  }

  get connecting(): StartConnectDetail | undefined {
    return connectDetail(this.interaction);
  }

  @property()
  showLabels?: boolean;

  @property()
  showIeds?: boolean;

  @property({ type: Boolean }) disabled: boolean = false;

  @property() selectable: string[] = [];

  @property() highlight: { id: string; style: Style }[] = [];

  /** Sections that were routed through other elements to stay connected. */
  @property({ attribute: false }) routingWarnings: Element[] = [];

  @state()
  get idle(): boolean {
    return this.interaction.mode === 'idle';
  }

  /**
   * True when `element` is, or is contained by, the element currently being
   * placed. Such an element moves with the cursor as the placing-preview ghost,
   * so the base layers suppress it (the preview paints it instead) and the
   * position helpers apply the live mouse offset to it. This is the one way a
   * base layer's appearance is parameterised by the placing mode.
   */
  private isPartOfPlacingElement(element: Element): boolean {
    return (
      !!this.placing && element.closest(this.placing.localName) === this.placing
    );
  }

  @query('svg#sld')
  sld!: SVGGraphicsElement;

  @state()
  mouseX = 0;

  @state()
  mouseY = 0;

  private iedResolutionCache = new Map<Element, Element | null>();

  protected override willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('doc') ||
      changedProperties.has('docVersion') ||
      changedProperties.has('substation')
    ) {
      this.iedResolutionCache.clear();
    }
  }

  protected override shouldUpdate(changedProperties: PropertyValues<this>) {
    if (!isMode(this.interaction, 'idle', 'locked')) {
      return true;
    }

    return !Array.from(changedProperties.keys()).every(property =>
      mouseCoordinateProperties.includes(property),
    );
  }

  private resolveIed(referencedIed: Element): Element | null {
    if (!this.iedResolutionCache.has(referencedIed)) {
      this.iedResolutionCache.set(
        referencedIed,
        resolveReferencedIed(referencedIed),
      );
    }

    return this.iedResolutionCache.get(referencedIed) ?? null;
  }

  @state()
  mouseX2 = 0;

  @state()
  mouseY2 = 0;

  @state()
  mouseX2f = 0;

  @state()
  mouseY2f = 0;

  svgCoordinates(clientX: number, clientY: number) {
    const p = new DOMPoint(clientX, clientY);
    const { x, y } = p.matrixTransform(this.sld.getScreenCTM()!.inverse());
    const result = [x, y].map(coord => Math.max(0, coord)) as Point;
    return result;
  }

  gridPosition(event: MouseEvent): Point {
    if (!event.isTrusted && !event.clientX && !event.clientY) {
      return [this.mouseX, this.mouseY];
    }

    const [clientX, clientY] = [event.clientX, event.clientY];
    const [x, y] = this.svgCoordinates(clientX, clientY);
    return [Math.floor(x), Math.floor(y)];
  }

  halfGridPosition(event: MouseEvent): Point {
    if (!event.isTrusted && !event.clientX && !event.clientY) {
      return [this.mouseX2, this.mouseY2];
    }

    const [clientX, clientY] = [event.clientX, event.clientY];
    const [x, y] = this.svgCoordinates(clientX, clientY);
    return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
  }

  renderedLabelPosition(element: Element, { preview = false } = {}): Point {
    let {
      label: [x, y],
    } = attributes(element);
    const [offsetX, offsetY] =
      isIedReferenceElement(element) &&
      !getSLDAttributes(element, 'x') &&
      preview
        ? [-1, -1]
        : this.placingOffset;
    if (this.isPartOfPlacingElement(element)) {
      const {
        pos: [parentX, parentY],
      } = attributes(this.placing!);
      x += this.mouseX - parentX - offsetX;
      y += this.mouseY - parentY - offsetY;
    }
    if (this.placingLabel === element) {
      x = this.mouseX2 - 0.5 - offsetX;
      y = this.mouseY2 + 0.5 - offsetY;
    }
    if (this.resizingTL === element) {
      const {
        pos: [resX, resY],
        dim: [resW, resH],
      } = attributes(element);
      if (resX === x && resY === y) {
        const [newX, newY] = this.busBarResizeRect() ?? [
          Math.min(this.mouseX, resX + resW - 1),
          Math.min(this.mouseY, resY + resH - 1),
        ];
        x += newX - resX;
        y += newY - resY;
      }
    }
    return [x, y];
  }

  renderedPosition(element: Element): Point {
    let {
      pos: [x, y],
    } = attributes(element);
    if (this.isPartOfPlacingElement(element)) {
      const {
        pos: [parentX, parentY],
      } = attributes(this.placing!);
      const [offsetX, offsetY] = this.placingOffset;
      x += this.mouseX - parentX - offsetX;
      y += this.mouseY - parentY - offsetY;
    }
    return [x, y];
  }

  /**
   * Returns the substation's diagram as an export-ready SVG string.
   * The viewer alone knows how it constructs the SVG and which nodes are
   * editing chrome, so it owns normalization/serialization; the editor decides
   * what to do with the result (e.g. trigger a file download).
   */
  exportableSvg(): string {
    return serializeForExport(this.sld);
  }

  nearestOpenTerminal(equipment?: Element): 'T1' | 'T2' | undefined {
    if (!equipment) {
      return undefined;
    }
    const topTerminal = equipment.querySelector('Terminal[name="T1"]');
    const bottomTerminal = equipment.querySelector('Terminal:not([name="T1"])');
    const oneSided = singleTerminal.has(equipment.getAttribute('type')!);
    if (topTerminal && bottomTerminal) {
      return undefined;
    }
    if (oneSided && (topTerminal || bottomTerminal)) {
      return undefined;
    }
    if (oneSided) {
      return 'T1';
    }
    if (topTerminal) {
      return 'T2';
    }
    if (bottomTerminal) {
      return 'T1';
    }

    const [mx, my] = [this.mouseX2f, this.mouseY2f];
    const {
      rot,
      pos: [x, y],
    } = attributes(equipment);
    if (rot === 0 && my >= y + 0.5) {
      return 'T2';
    }
    if (rot === 1 && mx < x + 0.5) {
      return 'T2';
    }
    if (rot === 2 && my < y + 0.5) {
      return 'T2';
    }
    if (rot === 3 && mx >= x + 0.5) {
      return 'T2';
    }
    return 'T1';
  }

  groundTerminal(equipment: Element, name: 'T1' | 'T2' | 'N1' | 'N2') {
    this.dispatchEvent(newGroundTerminalEvent(equipment, name));
  }

  requestContextMenu(element: Element, event: MouseEvent): void {
    const [gridX, gridY] = this.gridPosition(event);
    this.dispatchEvent(
      newOpenContextMenuEvent({
        element,
        x: event.clientX,
        y: event.clientY,
        gridX,
        gridY,
      }),
    );
  }

  /**
   * Composes the substation SVG as one z-ordered stack of layers (paint order =
   * z-order; last drawn wins). Each layer is one of two kinds by *presence*:
   *
   * - **base layers** — always in the stack: `renderVoltageLevelLayer`,
   *   `renderConnectivityLayer`, `renderPowerTransformerLayer`, `renderIedLayer`,
   *   `renderLabelLayer`.
   * - **mode layers** — present only during one interaction mode, each gated on
   *   the relevant field/payload: `renderVoltageLevelPlacingTarget` (placing a
   *   VoltageLevel), `renderConnectionPreviewLayer` +
   *   `renderConnectModeEquipmentLayer` (connecting), `renderPlacingTargetsLayer`
   *   + `renderPlacingPreview` (placing).
   *
   * Mode layers are NOT a top tier — they are interleaved at fixed z-positions
   * (the VL placing target paints at the back; the connection preview in the
   * middle), so the call order here must not change. Base-layer *appearance* may
   * still vary by mode via `isPartOfPlacingElement` (the placed element is
   * suppressed here and re-painted as the preview ghost).
   */
  render() {
    const {
      dim: [w, h],
    } = attributes(this.substation);

    // The five base layers (voltage levels, connectivity, power transformers,
    // IEDs, labels) are position-independent: their geometry derives from the
    // document and interaction, never from the live cursor — except in the four
    // modes where a base artifact tracks the mouse (resize preview, connect
    // target highlight/snap, and the label-repositioning preview, which is
    // painted inside the guarded label layer). Memoizing them with `guard` lets
    // the per-move re-renders that keep the placing/connect preview under the
    // cursor skip re-evaluating the whole (potentially thousands of `<g>`) base
    // stack.
    const reroutes = this.plannedReroutes();
    this.hideSections([
      ...reroutes.map(route => route.section),
      ...this.replacedSections(),
    ]);
    const baseLayerTracksMouse =
      this.interaction.mode === 'resizingBR' ||
      this.interaction.mode === 'resizingTL' ||
      this.interaction.mode === 'connectingFrom' ||
      this.interaction.mode === 'placingLabel';
    const baseLayerKey = [
      this.substation,
      this.docVersion,
      this.interaction,
      this.showLabels,
      this.showIeds,
      this.gridSize,
      this.highlight,
      this.selectable,
      this.disabled,
      this.hiddenSections,
      // Mouse coordinates only invalidate the base layers in the modes that
      // paint them from the cursor; elsewhere a constant keeps the key stable so
      // guard reuses the memoized layers across cursor moves.
      baseLayerTracksMouse ? this.mouseX : 0,
      baseLayerTracksMouse ? this.mouseY : 0,
      baseLayerTracksMouse ? this.mouseX2 : 0,
      baseLayerTracksMouse ? this.mouseY2 : 0,
      baseLayerTracksMouse ? this.mouseX2f : 0,
      baseLayerTracksMouse ? this.mouseY2f : 0,
    ];

    return html`<section>
      <slot name="header"></slot>
      <svg
        xmlns="${svgNs}"
        xmlns:xlink="${xlinkNs}"
        id="sld"
        viewBox="0 0 ${w} ${h}"
        width="${w * this.gridSize}"
        height="${h * this.gridSize}"
        stroke-width="0.06"
        fill="none"
        @mousemove=${(e: MouseEvent) => {
          if (this.disabled) {
            return;
          }

          const [x, y] = this.svgCoordinates(e.clientX, e.clientY);
          this.mouseX = Math.floor(x);
          this.mouseY = Math.floor(y);
          this.mouseX2 = Math.round(x * 2) / 2;
          this.mouseY2 = Math.round(y * 2) / 2;
          this.mouseX2f = Math.floor(x * 2) / 2;
          this.mouseY2f = Math.floor(y * 2) / 2;
        }}
      >
        <style>
          .handle {
            visibility: hidden;
          }
          :focus {
            outline: none;
          }
          g:hover > .handle {
            opacity: 0.2;
            visibility: visible;
          }
          g:hover > .handle:hover {
            visibility: visible;
            opacity: 0.83;
          }
          g.voltagelevel > rect,
          g.bay > rect {
            shape-rendering: crispEdges;
          }
          .routing-warning .trace {
            visibility: hidden;
          }
          .routing-warning:hover .trace {
            visibility: visible;
          }
          svg:not(:hover) .preview {
            visibility: hidden;
          }
          .preview {
            opacity: 0.75;
          }
        </style>
        ${symbols}
        <rect width="100%" height="100%" style="fill: var(--md-sys-color-surface, var(--oscd-base3))" />
        ${this.renderVoltageLevelPlacingTarget()}
        ${guard(baseLayerKey, () => this.renderVoltageLevelLayer())}
        ${this.renderConnectionPreviewLayer()}
        ${this.renderConnectModeEquipmentLayer()}
        ${guard(baseLayerKey, () => [
          this.renderConnectivityLayer(),
          this.renderPowerTransformerLayer(),
          this.renderIedLayer(),
          this.renderLabelLayer(),
        ])}
        ${this.renderReroutePreviewLayer(reroutes)}
        ${this.renderBusBarResizePreview()}
        ${this.renderPlacingTargetsLayer()}
        ${this.renderPlacingPreview()}
        ${this.renderRoutingWarnings()}
        ${this.renderRerouteTarget()}
        ${this.renderBusBarResizeTarget()}
      </svg>
    </section>`;
  }

  renderLabel(element: Element, { preview = false } = {}) {
    return renderArtifactLabel(element, this.sharedContext(), { preview });
  }


  /**
   * The VoltageLevel drop-zone, painted near the BACK of the stack (behind
   * existing voltage levels) — a VL is dropped *behind* the diagram. Mutually
   * exclusive with `renderPlacingTargetsLayer` (only one placing mode at a time).
   */
  private renderVoltageLevelPlacingTarget() {
    if (this.placing?.tagName !== 'VoltageLevel') {
      return nothing;
    }
    return svg`<rect width="100%" height="100%" fill="url(#grid)" />`;
  }

  /**
   * The full-canvas drop-targets for elements that may land anywhere in the
   * substation (PowerTransformer / IED / Label), painted near the FRONT of the
   * stack so they catch clicks over existing elements. All three are mutually
   * exclusive (gated on the active placing mode), so at most one is live.
   */
  private renderPlacingTargetsLayer() {
    const transformerPlacingTarget =
      this.placing?.tagName === 'PowerTransformer'
        ? svg`<rect width="100%" height="100%" fill="url(#grid)" />`
        : nothing;

    const iedPlacingTarget =
      !!this.placing && isIedReferenceElement(this.placing)
        ? svg`<rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            @click=${() => {
              const element = this.placing!;
              const [x, y] = this.renderedPosition(element);
              if (!canPlaceAt(this.substation, element, x, y, 1, 1)) {
                return;
              }

              const parent =
                Array.from(
                  this.substation.querySelectorAll(
                    ':scope > VoltageLevel > Bay',
                  ),
                )
                  .concat(
                    Array.from(
                      this.substation.querySelectorAll(':scope > VoltageLevel'),
                    ),
                  )
                  .find(vlOrBay => containsRect(vlOrBay, x, y, 1, 1)) ||
                this.substation;

              this.dispatchEvent(newPlaceEvent({ x, y, element, parent }));
            }}
          />`
        : nothing;

    const placingLabelTarget = this.placingLabel
      ? svg`<rect width="100%" height="100%" fill="url(#halfgrid)"
      @click=${() => {
        const element = this.placingLabel!;
        const [x, y] = this.renderedLabelPosition(element, { preview: true });
        this.dispatchEvent(newPlaceLabelEvent({ element, x, y }));
      }}
      />`
      : nothing;

    return [transformerPlacingTarget, iedPlacingTarget, placingLabelTarget];
  }

  private renderPlacingPreview() {
    if (!this.placing) {
      return svg``;
    }
    if (this.placing.tagName === 'VoltageLevel') {
      return renderVoltageLevel(this.placing, this.containerContext(), true);
    }
    if (isBay(this.placing)) {
      return renderBay(this.placing, this.containerContext(), true);
    }
    if (this.placing.tagName === 'ConductingEquipment') {
      return this.renderEquipment(this.placing, { preview: true });
    }
    if (isIedReferenceElement(this.placing)) {
      return this.renderIed(this.placing, { preview: true });
    }
    if (this.placing.tagName === 'PowerTransformer') {
      return this.renderPowerTransformer(this.placing, true);
    }
    if (isBusBar(this.placing)) {
      return this.renderBusBar(this.placing);
    }
    return svg``;
  }

  /** A thick line for a bus bar over `rect`; its cells can be clicked to commit. */
  private renderBusBarLine(rect: Rect, invalid = false) {
    const [[x1, y1], [x2, y2]] = busBarLine(rect);
    return svg`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke-width="0.12" stroke-linecap="round" pointer-events="none"
      stroke="${invalid ? 'var(--oscd-sld-invalid-placement-color)' : 'currentColor'}" />`;
  }

  /** The bus bar as it would run with its end at the cursor. */
  private renderBusBarResizePreview() {
    const rect = this.busBarResizeRect();
    return rect ? this.renderBusBarLine(rect) : nothing;
  }

  /** Catches the click that sizes the bus bar being resized. */
  private renderBusBarResizeTarget() {
    const resizing = this.resizingBusBar;
    if (this.disabled || !resizing) {
      return nothing;
    }
    const { bay, handle } = resizing;
    const [x, y, w, h] = this.busBarResizeRect()!;
    return svg`<rect width="100%" height="100%" fill="none" pointer-events="all"
      @click=${() =>
        this.dispatchEvent(
          handle === 'BR'
            ? newResizeEvent({ element: bay, w, h })
            : newResizeTLEvent({ element: bay, x, y, w, h }),
        )} />`;
  }

  private renderVoltageLevelLayer() {
    return Array.from(this.substation.children)
      .filter(child => child.tagName === 'VoltageLevel')
      .map(vl => svg`${renderVoltageLevel(vl, this.containerContext())}`);
  }

  private renderConnectionPreviewLayer() {
    if (this.connecting?.from.closest('Substation') !== this.substation) {
      return [];
    }

    const { from, fromTerminal } = this.connecting;

    const targetEq = Array.from(
      this.substation.querySelectorAll('ConductingEquipment'),
    )
      .filter(eq => eq !== from)
      .find((eq) => {
        const {
          pos: [x, y],
        } = attributes(eq);
        return x === this.mouseX && y === this.mouseY;
      });

    const toTerminal = this.nearestOpenTerminal(targetEq);

    let snap: { near: Point; far: Point } | undefined;
    if (targetEq && toTerminal) {
      const [close, far] = connectionStartPoints(targetEq)[toTerminal];
      snap = { near: close, far };
    }

    const cursor: Point = [this.mouseX2, this.mouseY2];

    // Going back past an anchor takes the anchor away.
    const aim = snap ? snapApproachPoint(snap) : cursor;
    const path = backtrackPath(this.connecting.path, aim);
    const [anchor] = path.slice(-2);
    const cutHere = anchor[0] === aim[0] && anchor[1] === aim[1];

    // Over a connectable wire the connection meets it where the route first
    // reaches it, wherever on the wire the cursor is.
    const wireNode = snap ? undefined : this.connectivityNodeAt(cursor);
    const wireRoute = wireNode
      ? this.routeToConnectivityNode(path, wireNode)
      : undefined;

    // Auto-routed around obstacles; a snapped route ends in front of the
    // terminal and then runs straight in.
    const route =
      wireRoute ??
      (cutHere
        ? [aim]
        : this.routeConnection(path, aim, snap?.far));

    // The already-committed waypoints (every point but the provisional last
    // one) continuing through the route. Without a clean route the preview stops
    // at the last waypoint and clicking does nothing.
    const previewPoints: Point[] = [
      ...path.slice(0, -1),
      ...(route ?? []),
      ...(route && snap ? [snap.far, snap.near] : []),
    ].filter(
      ([x, y], i, all) => !i || x !== all[i - 1][0] || y !== all[i - 1][1],
    );

    const segment = (start: Point, end: Point) =>
      svg`<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}"
                stroke-linecap="square" stroke="currentColor" />`;

    // draw a line between each consecutive pair of points
    const lines = previewPoints
      .slice(1)
      .map((point, index) => segment(previewPoints[index], point));

    const dropTarget = svg`<rect width="100%" height="100%" fill="url(#grid)"
      @click=${() => {
        if (wireNode && wireRoute) {
          this.dispatchEvent(
            newConnectEvent({
              from,
              fromTerminal,
              path: finishRoute(path, wireRoute),
              to: wireNode,
            }),
          );
          return;
        }
        if (!route) {
          return;
        }
        const newPath = snap
          ? finishRoute(path, route, snap.far, snap.near)
          : extendRoute(path, route);
        this.dispatchEvent(newExtendConnectPointEvent(newPath));
        if (targetEq && toTerminal) {
          this.dispatchEvent(
            newConnectEvent({
              from,
              fromTerminal,
              path: newPath,
              to: targetEq,
              toTerminal,
            }),
          );
        }
      }} />`;

    return [...lines, dropTarget];
  }

  /**
   * While a connection is being drawn in this substation, every
   * `ConductingEquipment` is suppressed in its container layer (see
   * conducting-equipment.ts) and re-painted here as a flat top overlay in
   * connect mode: terminal connect-indicators on, and click-through enabled so
   * clicks fall through to the connection drop-target beneath.
   */
  private renderConnectModeEquipmentLayer() {
    if (this.connecting?.from.closest('Substation') !== this.substation) {
      return nothing;
    }
    return Array.from(
      this.substation.querySelectorAll('ConductingEquipment'),
    ).map(eq => this.renderEquipment(eq, { connect: true }));
  }

  private renderConnectivityLayer() {
    return Array.from(this.substation.querySelectorAll('ConnectivityNode'))
      .filter(
        node =>
          node.getAttribute('name') !== 'grounded' &&
          !this.isPartOfPlacingElement(node),
      )
      .sort(
        (a, b) =>
          Number(isBusBar(a.parentElement!)) -
          Number(isBusBar(b.parentElement!)),
      )
      .map(cNode => this.renderConnectivityNode(cNode));
  }

  private renderPowerTransformerLayer() {
    return Array.from(
      this.substation.querySelectorAll(':scope > PowerTransformer'),
    ).map(transformer => this.renderPowerTransformer(transformer));
  }

  private renderIedLayer() {
    return iedReferences(this.substation)
      .filter(
        referencedIed =>
          referencedIed.parentElement?.tagName === 'Private' &&
          !['Bay', 'VoltageLevel'].includes(
            referencedIed.parentElement!.parentElement!.tagName,
          ) &&
          !this.isPartOfPlacingElement(referencedIed),
      )
      .map(ied => this.renderIed(ied));
  }

  private renderLabelLayer() {
    return Array.from(
      this.substation.querySelectorAll(
        'VoltageLevel, Bay, ConductingEquipment, PowerTransformer, Text',
      ),
    )
      .concat(
        Array.from(
          this.substation.querySelectorAll(
            'Private[type="OpenSCD-SLD-Layout"]',
          ) ?? [],
        ).flatMap(privateLayout => iedReferences(privateLayout)),
      )
      .filter(e => !this.isPartOfPlacingElement(e))
      .map(element => this.renderLabel(element));
  }

  private containerContext(): EquipmentContainerContext {
    return {
      ...this.sharedContext(),
      highlight: this.highlight,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      svgCoordinates: (clientX, clientY) =>
        this.svgCoordinates(clientX, clientY),
      renderEquipment: equipment => this.renderEquipment(equipment),
      renderPowerTransformer: equipment =>
        this.renderPowerTransformer(equipment),
      renderIed: (referencedIed, options) =>
        this.renderIed(referencedIed, options),
      renderConnectivityNode: cNode => this.renderConnectivityNode(cNode),
    };
  }

  renderPowerTransformer(
    transformer: Element,
    preview = false,
  ): SVGTemplateResult {
    return this.renderArtifact(
      powerTransformerArtifact,
      transformer,
      this.powerTransformerContext(),
      { preview },
    );
  }

  private sharedContext(): SldSharedContext {
    return {
      disabled: this.disabled,
      dispatch: event => this.dispatchEvent(event),
      gridPosition: event => this.gridPosition(event),
      halfGridPosition: event => this.halfGridPosition(event),
      interaction: this.interaction,
      requestContextMenu: (element, event) =>
        this.requestContextMenu(element, event),
      resolveIed: referencedIed => this.resolveIed(referencedIed),
      renderedLabelPosition: (element, options) =>
        this.renderedLabelPosition(element, options),
      renderedPosition: element => this.renderedPosition(element),
      selectable: this.selectable,
      substation: this.substation,
      view: {
        showLabels: this.showLabels,
        showIeds: this.showIeds,
      },
    };
  }

  private equipmentContext(): EquipmentContext {
    return {
      ...this.sharedContext(),
      groundTerminal: (element, terminal) =>
        this.groundTerminal(element, terminal),
      highlight: this.highlight,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      nearestOpenTerminal: equipment => this.nearestOpenTerminal(equipment),
    };
  }

  private busBarContext(): BusBarContext {
    return this.connectivityNodeContext();
  }

  private powerTransformerContext(): PowerTransformerContext {
    return {
      ...this.sharedContext(),
      groundTerminal: (element, terminal) =>
        this.groundTerminal(element, terminal),
      highlight: this.highlight,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
    };
  }

  private renderArtifact<TState, TActions, TContext extends SldSharedContext>(
    descriptor: SldArtifactDescriptor<TState, TActions, TContext>,
    element: Element,
    context: TContext,
    options: ArtifactRenderOptions = {},
  ): SVGTemplateResult {
    const state = descriptor.state(element, context, options);
    if (!state) {
      return svg``;
    }

    return descriptor.render(
      element,
      state,
      descriptor.actions(element, context, state),
      context,
      options,
    );
  }

  renderEquipment(
    equipment: Element,
    options: { preview?: boolean; connect?: boolean } = {},
  ): SVGTemplateResult {
    return this.renderArtifact(
      conductingEquipmentArtifact,
      equipment,
      this.equipmentContext(),
      options,
    );
  }

  renderIed(
    referencedIed: Element,
    { preview = false } = {},
  ): SVGTemplateResult {
    return this.renderArtifact(
      iedReferenceArtifact,
      referencedIed,
      this.sharedContext(),
      { preview },
    );
  }

  renderBusBar(busBar: Element) {
    return this.renderArtifact(
      busBarArtifact,
      busBar,
      this.busBarContext(),
    );
  }

  private connectivityNodeContext(): ConnectivityNodeContext {
    return {
      ...this.sharedContext(),
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      mouseX2: this.mouseX2,
      mouseY2: this.mouseY2,
      hiddenSections: this.hiddenSections,
      routeToConnectivityNode: (path, cNode) => {
        const base = backtrackPath(path, [this.mouseX2, this.mouseY2]);
        const route = this.routeToConnectivityNode(base, cNode);
        return route && finishRoute(base, route);
      },
    };
  }

  private reroutePreview: { key: unknown[]; routes: PreviewRoute[] } = {
    key: [],
    routes: [],
  };

  /**
   * Where the connections to the element being placed would run if it were
   * dropped where it is now.
   */
  private plannedReroutes(): PreviewRoute[] {
    const resizing = this.resizingBusBar;
    if (resizing) {
      const rect = this.busBarResizeRect()!;
      const key = [resizing.bay, this.docVersion, ...rect];
      if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
        const [start, end] = busBarLine(rect);
        this.reroutePreview = {
          key,
          routes: planReroutes(this.doc, {
            kind: 'bus',
            element: resizing.bay,
            start,
            end,
          }),
        };
      }
      return this.reroutePreview.routes;
    }

    if (this.interaction.mode === 'reroutingSection') {
      const section = this.interaction.element;
      const via: Point = [this.mouseX2, this.mouseY2];
      const key = [section, this.docVersion, ...via];
      if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
        this.reroutePreview = {
          key,
          routes:
            section.getRootNode() === this.doc
              ? planReroutes(this.doc, { kind: 'section', element: section, via })
              : [],
        };
      }
      return this.reroutePreview.routes;
    }

    const { placing } = this;
    if (
      !placing ||
      placing.getRootNode() !== this.doc ||
      placing.closest('Substation') !== this.substation ||
      placing.localName === 'Vertex'
    ) {
      return [];
    }
    const [x, y] = this.renderedPosition(placing);
    const {
      pos: [oldX, oldY],
    } = attributes(placing);
    const [dx, dy] = [x - oldX, y - oldY];
    if (!dx && !dy) {
      return [];
    }

    const key = [placing, this.docVersion, dx, dy];
    if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
      const change = { kind: 'move', element: placing, dx, dy } as const;
      const planned = planReroutes(this.doc, change);
      this.reroutePreview = {
        key,
        routes: [
          ...planned,
          ...overlappedSections(
            this.doc,
            change,
            new Set(planned.map(route => route.section)),
          ).map(flagged => ({ ...flagged, fallback: true })),
        ],
      };
    }
    return this.reroutePreview.routes;
  }

  /** The sections drawn as previews; kept the same set while they are the same sections. */
  private hiddenSections = new Set<Element>();

  /** The wire whose connection a new connection from its terminal replaces, or the bus bar being resized. */
  private replacedSections(): Element[] {
    const resizing = this.resizingBusBar;
    if (resizing) {
      return busSections(resizing.bay);
    }
    if (this.interaction.mode !== 'connectingFrom') {
      return [];
    }
    const uuid = this.interaction.replacing
      ? getSLDAttributes(this.interaction.replacing, 'uuid')
      : undefined;
    const vertex = uuid
      ? Array.from(this.substation.getElementsByTagNameNS(sldNs, 'Vertex')).find(
        candidate => getSLDAttributes(candidate, 'uuid') === uuid,
      )
      : undefined;
    return vertex?.parentElement ? [vertex.parentElement] : [];
  }

  private hideSections(sections: Element[]) {
    if (
      sections.length !== this.hiddenSections.size ||
      sections.some(section => !this.hiddenSections.has(section))
    ) {
      this.hiddenSections = new Set(sections);
    }
  }

  private renderReroutePreviewLayer(routes: PreviewRoute[]) {
    return routes.map(
      ({ points, fallback }) =>
        svg`<polyline fill="none" stroke-linecap="square" pointer-events="none"
          points="${points.map(point => point.join(',')).join(' ')}"
          stroke="${fallback ? 'var(--oscd-sld-routing-warning-color)' : 'currentColor'}"
          stroke-dasharray="${fallback ? '0.15 0.1' : nothing}" />`,
    );
  }

  /** Catches the click that places the point a wire being re-routed goes through. */
  private renderRerouteTarget() {
    if (this.disabled || this.interaction.mode !== 'reroutingSection') {
      return nothing;
    }
    const section = this.interaction.element;
    return svg`<rect width="100%" height="100%" fill="none" pointer-events="all"
      @click=${() =>
        this.dispatchEvent(
          newRerouteSectionEvent({
            section,
            via: [this.mouseX2, this.mouseY2],
          }),
        )} />`;
  }

  /** The middle of where a wire first runs through equipment, or else of its longest leg. */
  private warningAnchor(section: Element, points: Point[]): Point {
    const attached = new Set(
      Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).flatMap(
        (vertex) => {
          const uuid = getSLDAttributes(vertex, 'uuid');
          return uuid
            ? Array.from(
              this.substation.querySelectorAll('Terminal, NeutralPoint'),
            )
              .filter(terminal => getSLDAttributes(terminal, 'uuid') === uuid)
              .map(terminal =>
                terminal.closest('ConductingEquipment, PowerTransformer'),
              )
            : [];
        },
      ),
    );
    const boxes = [
      ...Array.from(
        this.substation.querySelectorAll('ConductingEquipment, PowerTransformer'),
      ),
      ...iedReferences(this.substation),
    ]
      .filter(element => !attached.has(element))
      .flatMap(element => obstacleRects(element));
    const legs = points
      .slice(1)
      .map((end, i): [Point, Point] => [points[i], end]);
    const middle = ([a, b]: [Point, Point]): Point => [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
    ];
    for (const [start, end] of legs) {
      const [lx, hx] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
      const [ly, hy] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];
      const box = boxes.find(
        ([x, y, w, h]) => hx > x && lx < x + w && hy > y && ly < y + h,
      );
      if (box) {
        const [x, y, w, h] = box;
        return middle([
          [Math.max(lx, x), Math.max(ly, y)],
          [Math.min(hx, x + w), Math.min(hy, y + h)],
        ]);
      }
    }
    const [longest] = [...legs].sort(
      ([a, b], [c, d]) =>
        Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) -
        (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])),
    );
    return middle(longest);
  }

  /** Marks wires that were routed through other elements; hovering traces the wire, a click dismisses the mark. */
  private renderRoutingWarnings() {
    if (this.disabled || !isMode(this.interaction, 'idle')) {
      return nothing;
    }
    return this.routingWarnings
      .filter(section => section.closest('Substation') === this.substation)
      .flatMap((section) => {
        const points = Array.from(
          section.getElementsByTagNameNS(sldNs, 'Vertex'),
        ).map(vertex => attributes(vertex).pos);
        if (points.length < 2) {
          return [];
        }
        const dismiss = (event: MouseEvent) => {
          event.stopPropagation();
          this.dispatchEvent(newDismissRoutingWarningEvent(section));
        };
        const [x, y] = this.warningAnchor(section, points);
        return [
          svg`<g class="routing-warning" role="button" style="cursor: pointer"
          @click=${dismiss}>
          <polyline class="trace" fill="none" stroke-linecap="square"
            pointer-events="none" stroke-dasharray="0.15 0.1"
            points="${points.map(point => point.join(',')).join(' ')}"
            stroke="var(--oscd-sld-routing-warning-color)" />
          <title>This connection had to be drawn through other elements to stay connected. Click to dismiss.</title>
          <circle cx="${x}" cy="${y}" r="0.3" stroke-width="0.04"
            style="fill: var(--oscd-sld-routing-warning-color); stroke: var(--md-sys-color-surface, var(--oscd-base3))" />
          <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"
            font-size="0.4" font-weight="bold" stroke="none" pointer-events="none"
            style="fill: var(--md-sys-color-surface, var(--oscd-base3))">!</text>
        </g>`,
        ];
      });
  }

  private routerCache?: {
    key: unknown[];
    build: (mode: RouterMode) => ConnectionRouter;
    routers: Partial<Record<RouterMode, ConnectionRouter>>;
  };

  private connectionRouter(mode: RouterMode = 'strict'): ConnectionRouter {
    const key = [this.substation, this.docVersion];
    if (!this.routerCache || key.some((k, i) => k !== this.routerCache!.key[i])) {
      const obstacles = [
        ...Array.from(
          this.substation.querySelectorAll(
            'ConductingEquipment, PowerTransformer',
          ),
        ),
        ...iedReferences(this.substation),
      ].flatMap(element => obstacleRects(element));
      const wires = Array.from(
        this.substation.querySelectorAll('ConnectivityNode'),
      ).flatMap(cNode =>
        wirePolylines(cNode).map(wire => ({ net: cNode, ...wire })),
      );
      const {
        dim: [w, h],
      } = attributes(this.substation);
      this.routerCache = {
        key,
        build: routerMode =>
          new ConnectionRouter(w, h, obstacles, wires, routerMode),
        routers: {},
      };
    }
    const { routers, build } = this.routerCache;
    routers[mode] ??= build(mode);
    return routers[mode]!;
  }

  /** Where a route begins; a connection just started from a winding first leaves the areas of its transformer. */
  private routeStart(path: Point[]): Point {
    const transformer =
      path.length === 2 && this.connecting?.from.closest('PowerTransformer');
    return transformer
      ? leaveRects(
        connectAnchor(path),
        connectHeading(path),
        obstacleRects(transformer),
      )
      : connectAnchor(path);
  }

  /**
   * Routes the connection being drawn from its last anchor to `target`. Where
   * there is no room to leave the equipment straight, it may turn on the
   * equipment's border instead and end at `tightTarget`.
   */
  private routeConnection(
    path: Point[],
    target: Point,
    tightTarget: Point = target,
  ): Point[] | undefined {
    if (!this.connecting) {
      return undefined;
    }
    const [anchor, direction, own] = [
      this.routeStart(path),
      connectHeading(path),
      path.slice(0, -1),
    ];
    return (
      this.connectionRouter().route(anchor, direction, target, own) ??
      this.connectionRouter('tight').route(
        anchor,
        direction,
        tightTarget,
        own,
      )
    );
  }

  /**
   * Routes the connection being drawn to the nearest place it can meet the
   * wires of `cNode`, or to the bend or free end under the cursor.
   */
  private routeToConnectivityNode(
    path: Point[],
    cNode: Element,
  ): Point[] | undefined {
    if (!this.connecting) {
      return undefined;
    }
    const route = (mode: RouterMode) =>
      this.connectionRouter(mode).routeToNet(
        this.routeStart(path),
        connectHeading(path),
        cNode,
        path.slice(0, -1),
        [this.mouseX2, this.mouseY2],
      );
    return route('strict') ?? route('tight');
  }

  /** The topmost connectable connectivity node whose wire runs under `cursor`. */
  private connectivityNodeAt([x, y]: Point): Element | undefined {
    const owner = this.connecting!.from.closest(
      'ConductingEquipment, PowerTransformer',
    );
    return Array.from(this.substation.querySelectorAll('ConnectivityNode'))
      .filter(
        cNode =>
          cNode.getAttribute('name') !== 'grounded' &&
          !owner?.querySelector(
            `[connectivityNode="${cNode.getAttribute('pathName')}"]`,
          ) &&
          wirePolylines(cNode).some(({ points }) =>
            points.slice(1).some(([x2, y2], i) => {
              const [x1, y1] = points[i];
              return (
                (y === y1 && y === y2 && (x - x1) * (x - x2) <= 0) ||
                (x === x1 && x === x2 && (y - y1) * (y - y2) <= 0)
              );
            }),
          ),
      )
      .sort(
        (a, b) =>
          Number(isBusBar(a.parentElement!)) -
          Number(isBusBar(b.parentElement!)),
      )
      .pop();
  }

  renderConnectivityNode(cNode: Element) {
    return renderArtifactConnectivityNode(
      cNode,
      this.connectivityNodeContext(),
    );
  }

  static styles = [
    sldThemeStyles,
    css`
    :host {
      display: block;
    }

    /*
     * Contain the intrinsically-sized svg (width = w × gridSize) within this
     * host. This is dormant in the plugin — nothing there constrains the
     * viewer's width (the host lays out at 'width: fit-content'), so the section
     * grows to the svg's native size and never scrolls; the shell owns the
     * scroll/zoom viewport. It only activates for a *constrained* standalone
     * consumer (e.g. a fixed-width card), where it scrolls instead of spilling.
     * See the fit-to-container workstream for scale-to-fit (vs. scroll).
     */
    section {
      overflow: auto;
    }

    #sld {
      color: var(--md-sys-color-on-surface, var(--oscd-base03));
    }

    .disabled:not(.selectable) {
      pointer-events: none;
      opacity: 0.2;
    }

    .disabled.selectable > text {
      pointer-events: all;
    }

    * {
      user-select: none;
    }
  `,
  ];
}
