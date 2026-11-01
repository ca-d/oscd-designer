import { __decorate } from "tslib";
import { css, html, nothing, LitElement, svg, } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { guard } from 'lit/directives/guard.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { symbols, } from './drawing/diagram-symbols.js';
import { conductingEquipmentArtifact, } from './drawing/artifacts/conducting-equipment.js';
import { busBarArtifact } from './drawing/artifacts/bus-bar.js';
import { iedReferenceArtifact, } from './drawing/artifacts/ied-reference.js';
import { powerTransformerArtifact } from './drawing/artifacts/power-transformer.js';
import { renderLabel as renderArtifactLabel } from './drawing/artifacts/label.js';
import { renderConnectivityNode as renderArtifactConnectivityNode, } from './drawing/artifacts/connectivity-node.js';
import { renderVoltageLevel, renderBay, } from './drawing/artifacts/equipment-container.js';
import { leaveRects, obstacleRects } from './foundations/obstacles.js';
import { overlappedSections, planReroutes } from './foundations/rerouting.js';
import { ConnectionRouter, connectAnchor, connectHeading, backtrackPath, extendRoute, finishRoute, snapApproachPoint, } from './foundations/routing.js';
import { containsRect } from './foundations/element-geometry.js';
import { canPlaceAt, isUnsizedBusBar, isUnsizedContainer } from './foundations/sld-placement.js';
import { busBarJunctions, busBarLine, draggedBusBarRect, resizedBusBarRect, } from './foundations/bus-bar-edits.js';
import { busSections, canConnectToWinding, connectionStartPoints, isBusBar, } from './foundations/connectivity.js';
import { nearestWindingTerminalTarget, windingTerminalTargets, } from './foundations/transformer.js';
import { attributes, getSLDAttributes, xmlBoolean, } from './foundations/sld-attributes.js';
import { sldThemeStyles } from './theme.js';
import { DragToClickController } from './drag-to-click.js';
import { singleTerminal } from './foundations/equipment.js';
import { iedReferences, isIedReferenceElement, resolveIed as resolveReferencedIed, } from './foundations/ied.js';
import { newConnectEvent, newDismissRoutingWarningEvent, newExtendConnectPointEvent, newRerouteSectionEvent, newMoveJunctionEvent, newGroundTerminalEvent, newOpenContextMenuEvent, newPlaceEvent, newPlaceLabelEvent, newResizeEvent, newResizeTLEvent, } from './foundations/events.js';
import { serializeForExport } from './foundations/export.js';
import { sldNs, sldPrefix, svgNs, xlinkNs } from './foundations.js';
import { connectDetail, isMode } from './foundations/interaction-mode.js';
/** The wires of a connectivity node; terminals are where equipment attaches. */
function wirePolylines(cNode) {
    return Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')).map((section) => {
        const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
        return {
            bus: xmlBoolean(getSLDAttributes(section, 'bus')),
            points: vertices.map(vertex => attributes(vertex).pos),
            terminals: vertices
                .filter(vertex => vertex.hasAttributeNS(sldNs, 'uuid'))
                .map(vertex => attributes(vertex).pos),
        };
    });
}
function isBay(element) {
    return element.tagName === 'Bay' && !isBusBar(element);
}
const mouseCoordinateProperties = [
    'mouseX',
    'mouseY',
    'mouseX2',
    'mouseY2',
    'mouseX2f',
    'mouseY2f',
];
/** An editor [[`plugin`]] for editing the `Substation` section. */
export class SldSubstationViewer extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        // Drag-and-drop for placing, moving, resizing and connecting.
        this.dragToClick = new DragToClickController(this, {
            canStart: event => isMode(this.interaction, 'idle') &&
                !this.disabled &&
                event.composedPath().includes(this.sld),
            isActive: () => !isMode(this.interaction, 'idle', 'locked'),
        });
        // Dragging out a new VoltageLevel, Bay or bus bar between any two corners.
        this.dragOut = new DragToClickController(this, {
            canStart: event => !this.disabled &&
                !!this.placing &&
                (isUnsizedContainer(this.placing) || isUnsizedBusBar(this.placing)) &&
                event.composedPath().includes(this.sld),
            isActive: () => !!this.placing,
            begin: (press) => {
                this.dragAnchor = this.gridPosition(press);
            },
            finish: () => {
                this.dragAnchor = undefined;
            },
        });
        this.docVersion = -1;
        this.gridSize = 32;
        this.interaction = { mode: 'locked' };
        this.disabled = false;
        this.selectable = [];
        this.highlight = [];
        /** Sections that were routed through other elements to stay connected. */
        this.routingWarnings = [];
        this.mouseX = 0;
        this.mouseY = 0;
        this.iedResolutionCache = new Map();
        this.mouseX2 = 0;
        this.mouseY2 = 0;
        this.mouseX2f = 0;
        this.mouseY2f = 0;
        this.reroutePreview = {
            key: [],
            routes: [],
        };
        /** The sections drawn as previews; kept the same set while they are the same sections. */
        this.hiddenSections = new Set();
    }
    get nsp() {
        return sldPrefix(this.doc);
    }
    /**
     * The following read-only getters project the single {@link interaction}
     * value into the per-gesture shapes the render layers and drawing artifacts
     * consume. The view stores no interaction state of its own — it derives these
     * from the one `interaction` property supplied by the controller.
     */
    get placing() {
        return this.interaction.mode === 'placing'
            ? this.interaction.element
            : undefined;
    }
    get placingOffset() {
        return this.interaction.mode === 'placing' ||
            this.interaction.mode === 'placingLabel'
            ? this.interaction.offset
            : [0, 0];
    }
    get placingLabel() {
        return this.interaction.mode === 'placingLabel'
            ? this.interaction.element
            : undefined;
    }
    get resizingTL() {
        return this.interaction.mode === 'resizingTL'
            ? this.interaction.element
            : undefined;
    }
    /** The bus bar being resized, and the end of it that follows the cursor. */
    get resizingBusBar() {
        const { interaction } = this;
        if ((interaction.mode === 'resizingBR' || interaction.mode === 'resizingTL') &&
            isBusBar(interaction.element) &&
            interaction.element.closest('Substation') === this.substation) {
            return {
                bay: interaction.element,
                handle: interaction.mode === 'resizingBR' ? 'BR' : 'TL',
            };
        }
        return undefined;
    }
    /** The cells the bus bar being resized would cover with its end at the cursor. */
    busBarResizeRect() {
        const resizing = this.resizingBusBar;
        return (resizing &&
            resizedBusBarRect(resizing.bay, resizing.handle, [this.mouseX, this.mouseY]));
    }
    get connecting() {
        return connectDetail(this.interaction);
    }
    get idle() {
        return this.interaction.mode === 'idle';
    }
    /**
     * True when `element` is, or is contained by, the element currently being
     * placed. Such an element moves with the cursor as the placing-preview ghost,
     * so the base layers suppress it (the preview paints it instead) and the
     * position helpers apply the live mouse offset to it. This is the one way a
     * base layer's appearance is parameterised by the placing mode.
     */
    isPartOfPlacingElement(element) {
        return (!!this.placing && element.closest(this.placing.localName) === this.placing);
    }
    willUpdate(changedProperties) {
        if (changedProperties.has('doc') ||
            changedProperties.has('docVersion') ||
            changedProperties.has('substation')) {
            this.iedResolutionCache.clear();
        }
    }
    shouldUpdate(changedProperties) {
        if (!isMode(this.interaction, 'idle', 'locked')) {
            return true;
        }
        return !Array.from(changedProperties.keys()).every(property => mouseCoordinateProperties.includes(property));
    }
    resolveIed(referencedIed) {
        if (!this.iedResolutionCache.has(referencedIed)) {
            this.iedResolutionCache.set(referencedIed, resolveReferencedIed(referencedIed));
        }
        return this.iedResolutionCache.get(referencedIed) ?? null;
    }
    svgCoordinates(clientX, clientY) {
        const p = new DOMPoint(clientX, clientY);
        const { x, y } = p.matrixTransform(this.sld.getScreenCTM().inverse());
        const result = [x, y].map(coord => Math.max(0, coord));
        return result;
    }
    gridPosition(event) {
        if (!event.isTrusted && !event.clientX && !event.clientY) {
            return [this.mouseX, this.mouseY];
        }
        const [clientX, clientY] = [event.clientX, event.clientY];
        const [x, y] = this.svgCoordinates(clientX, clientY);
        return [Math.floor(x), Math.floor(y)];
    }
    halfGridPosition(event) {
        if (!event.isTrusted && !event.clientX && !event.clientY) {
            return [this.mouseX2, this.mouseY2];
        }
        const [clientX, clientY] = [event.clientX, event.clientY];
        const [x, y] = this.svgCoordinates(clientX, clientY);
        return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
    }
    /** Top-left of the element being placed: the cursor, or the dragged-out corner. */
    placingCorner() {
        const [anchorX, anchorY] = this.dragAnchor ?? [this.mouseX, this.mouseY];
        return [Math.min(anchorX, this.mouseX), Math.min(anchorY, this.mouseY)];
    }
    renderedLabelPosition(element, { preview = false } = {}) {
        let { label: [x, y], } = attributes(element);
        const [offsetX, offsetY] = isIedReferenceElement(element) &&
            !getSLDAttributes(element, 'x') &&
            preview
            ? [-1, -1]
            : this.placingOffset;
        if (this.isPartOfPlacingElement(element)) {
            const { pos: [parentX, parentY], } = attributes(this.placing);
            const [cornerX, cornerY] = this.placingCorner();
            x += cornerX - parentX - offsetX;
            y += cornerY - parentY - offsetY;
        }
        if (this.placingLabel === element) {
            x = this.mouseX2 - 0.5 - offsetX;
            y = this.mouseY2 + 0.5 - offsetY;
        }
        if (this.resizingTL === element) {
            const { pos: [resX, resY], dim: [resW, resH], } = attributes(element);
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
    renderedPosition(element) {
        let { pos: [x, y], } = attributes(element);
        if (this.isPartOfPlacingElement(element)) {
            const { pos: [parentX, parentY], } = attributes(this.placing);
            const [offsetX, offsetY] = this.placingOffset;
            const [cornerX, cornerY] = this.placingCorner();
            x += cornerX - parentX - offsetX;
            y += cornerY - parentY - offsetY;
        }
        return [x, y];
    }
    /**
     * Returns the substation's diagram as an export-ready SVG string.
     * The viewer alone knows how it constructs the SVG and which nodes are
     * editing chrome, so it owns normalization/serialization; the editor decides
     * what to do with the result (e.g. trigger a file download).
     */
    exportableSvg() {
        return serializeForExport(this.sld);
    }
    nearestOpenTerminal(equipment) {
        if (!equipment) {
            return undefined;
        }
        const topTerminal = equipment.querySelector('Terminal[name="T1"]');
        const bottomTerminal = equipment.querySelector('Terminal:not([name="T1"])');
        const oneSided = singleTerminal.has(equipment.getAttribute('type'));
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
        const { rot, pos: [x, y], } = attributes(equipment);
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
    groundTerminal(equipment, name) {
        this.dispatchEvent(newGroundTerminalEvent(equipment, name));
    }
    requestContextMenu(element, event) {
        const [gridX, gridY] = this.gridPosition(event);
        this.dispatchEvent(newOpenContextMenuEvent({
            element,
            x: event.clientX,
            y: event.clientY,
            gridX,
            gridY,
        }));
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
        const { dim: [w, h], } = attributes(this.substation);
        this.connectTarget = this.resolveConnectTarget();
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
        const baseLayerTracksMouse = this.interaction.mode === 'resizingBR' ||
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
        return html `<section>
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
        @mousemove=${(e) => {
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
        <rect width="100%" height="100%" style="fill: var(--md-sys-color-surface, var(--oscd-base3))"
          @contextmenu=${(event) => {
            event.preventDefault();
            if (!this.disabled && isMode(this.interaction, 'idle')) {
                this.requestContextMenu(this.substation, event);
            }
        }} />
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
        ${this.renderJunctionTarget()}
        ${this.renderBusBarResizeTarget()}
      </svg>
    </section>`;
    }
    renderLabel(element, { preview = false } = {}) {
        return renderArtifactLabel(element, this.sharedContext(), { preview });
    }
    /**
     * The VoltageLevel drop-zone, painted near the BACK of the stack (behind
     * existing voltage levels) — a VL is dropped *behind* the diagram. Mutually
     * exclusive with `renderPlacingTargetsLayer` (only one placing mode at a time).
     */
    renderVoltageLevelPlacingTarget() {
        if (this.placing?.tagName !== 'VoltageLevel') {
            return nothing;
        }
        return svg `<rect width="100%" height="100%" fill="url(#grid)" />`;
    }
    /**
     * The full-canvas drop-targets for elements that may land anywhere in the
     * substation (PowerTransformer / IED / Label), painted near the FRONT of the
     * stack so they catch clicks over existing elements. All three are mutually
     * exclusive (gated on the active placing mode), so at most one is live.
     */
    renderPlacingTargetsLayer() {
        const transformerPlacingTarget = this.placing?.tagName === 'PowerTransformer'
            ? svg `<rect width="100%" height="100%" fill="url(#grid)" />`
            : nothing;
        const iedPlacingTarget = !!this.placing && isIedReferenceElement(this.placing)
            ? svg `<rect
            width="100%"
            height="100%"
            fill="url(#grid)"
            @click=${() => {
                const element = this.placing;
                const [x, y] = this.renderedPosition(element);
                if (!canPlaceAt(this.substation, element, x, y, 1, 1)) {
                    return;
                }
                const parent = Array.from(this.substation.querySelectorAll(':scope > VoltageLevel > Bay'))
                    .concat(Array.from(this.substation.querySelectorAll(':scope > VoltageLevel')))
                    .find(vlOrBay => containsRect(vlOrBay, x, y, 1, 1)) ||
                    this.substation;
                this.dispatchEvent(newPlaceEvent({ x, y, element, parent }));
            }}
          />`
            : nothing;
        const placingLabelTarget = this.placingLabel
            ? svg `<rect width="100%" height="100%" fill="url(#halfgrid)"
      @click=${() => {
                const element = this.placingLabel;
                const [x, y] = this.renderedLabelPosition(element, { preview: true });
                this.dispatchEvent(newPlaceLabelEvent({ element, x, y }));
            }}
      />`
            : nothing;
        return [transformerPlacingTarget, iedPlacingTarget, placingLabelTarget];
    }
    renderPlacingPreview() {
        if (!this.placing) {
            return svg ``;
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
            return this.renderPowerTransformer(this.placing, { preview: true });
        }
        if (isBusBar(this.placing)) {
            return this.dragAnchor
                ? this.renderDraggedBusBar(this.placing, this.dragAnchor)
                : this.renderBusBar(this.placing);
        }
        return svg ``;
    }
    /** A thick line for a bus bar over `rect`; its cells can be clicked to commit. */
    renderBusBarLine(rect, invalid = false) {
        const [[x1, y1], [x2, y2]] = busBarLine(rect);
        return svg `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke-width="0.12" stroke-linecap="round" pointer-events="none"
      stroke="${invalid ? 'var(--oscd-sld-invalid-placement-color)' : 'currentColor'}" />`;
    }
    /** A new bus bar being dragged out from the cell `anchor` to the cursor. */
    renderDraggedBusBar(busBar, anchor) {
        const rect = draggedBusBarRect(anchor, [this.mouseX, this.mouseY]);
        const [x, y, w, h] = rect;
        const parent = Array.from(this.substation.querySelectorAll(':root > Substation > VoltageLevel')).find(vl => containsRect(vl, x, y, w, h));
        return svg `<g class="bus preview">
      ${this.renderBusBarLine(rect, !parent)}
      <rect width="100%" height="100%" fill="none" pointer-events="all"
        @click=${() => parent &&
            this.dispatchEvent(newPlaceEvent({ x, y, element: busBar, parent, w, h }))} />
    </g>`;
    }
    /** The bus bar as it would run with its end at the cursor, and its junctions. */
    renderBusBarResizePreview() {
        const rect = this.busBarResizeRect();
        const resizing = this.resizingBusBar;
        if (!rect || !resizing) {
            return nothing;
        }
        const line = busBarLine(rect);
        return svg `${this.renderBusBarLine(rect)}${busBarJunctions(resizing.bay, this.plannedReroutes().flatMap(({ ends, ...route }) => ends ? [{ ...route, ends }] : []), line).map(([x, y]) => svg `<circle fill="currentColor" cx="${x}" cy="${y}" r="0.15" pointer-events="none" />`)}`;
    }
    /** Catches the click that sizes the bus bar being resized. */
    renderBusBarResizeTarget() {
        const resizing = this.resizingBusBar;
        if (this.disabled || !resizing) {
            return nothing;
        }
        const { bay, handle } = resizing;
        const [x, y, w, h] = this.busBarResizeRect();
        return svg `<rect width="100%" height="100%" fill="none" pointer-events="all"
      @click=${() => this.dispatchEvent(handle === 'BR'
            ? newResizeEvent({ element: bay, w, h })
            : newResizeTLEvent({ element: bay, x, y, w, h }))} />`;
    }
    renderVoltageLevelLayer() {
        return Array.from(this.substation.children)
            .filter(child => child.tagName === 'VoltageLevel')
            .map(vl => svg `${renderVoltageLevel(vl, this.containerContext())}`);
    }
    /**
     * What the connection being drawn would end on at the current cursor: the
     * hovered conducting equipment (by grid cell) with an open terminal, else the
     * nearest open winding terminal. Resolved once per render, see `render()`.
     */
    resolveConnectTarget() {
        const from = this.connecting?.from;
        if (!from || from.closest('Substation') !== this.substation) {
            return undefined;
        }
        const targetEq = Array.from(this.substation.querySelectorAll('ConductingEquipment'))
            .filter(eq => eq !== from)
            .find((eq) => {
            const { pos: [x, y], } = attributes(eq);
            return x === this.mouseX && y === this.mouseY;
        });
        const toTerminal = this.nearestOpenTerminal(targetEq);
        if (targetEq && toTerminal) {
            const [near, far] = connectionStartPoints(targetEq)[toTerminal];
            return { to: targetEq, toTerminal, near, far };
        }
        const nearest = nearestWindingTerminalTarget(canConnectToWinding(from)
            ? Array.from(this.substation.querySelectorAll('PowerTransformer')).flatMap(transformer => Array.from(transformer.children)
                .filter(child => child.tagName === 'TransformerWinding')
                .flatMap(winding => windingTerminalTargets(winding, this.renderedPosition(transformer), attributes(transformer))))
            : [], [this.mouseX2, this.mouseY2]);
        return nearest
            ? {
                to: nearest.winding,
                toTerminal: nearest.terminal,
                near: nearest.near,
                far: nearest.far,
            }
            : undefined;
    }
    renderConnectionPreviewLayer() {
        if (this.connecting?.from.closest('Substation') !== this.substation) {
            return [];
        }
        const { from, fromTerminal } = this.connecting;
        const target = this.connectTarget;
        const cursor = [this.mouseX2, this.mouseY2];
        // Going back past an anchor takes the anchor away.
        const aim = target ? snapApproachPoint(target) : cursor;
        const path = backtrackPath(this.connecting.path, aim);
        const [anchor] = path.slice(-2);
        const cutHere = anchor[0] === aim[0] && anchor[1] === aim[1];
        // Over a connectable wire the connection meets it where the route first
        // reaches it, wherever on the wire the cursor is.
        const wireNode = target ? undefined : this.connectivityNodeAt(cursor);
        const wireRoute = wireNode
            ? this.routeToConnectivityNode(path, wireNode)
            : undefined;
        // Auto-routed around obstacles; a snapped route ends in front of the
        // terminal and then runs straight in.
        const route = wireRoute ??
            (cutHere
                ? [aim]
                : this.routeConnection(path, aim, target?.far));
        // The already-committed waypoints (every point but the provisional last
        // one) continuing through the route. Without a clean route the preview stops
        // at the last waypoint and clicking does nothing.
        const previewPoints = [
            ...path.slice(0, -1),
            ...(route ?? []),
            ...(route && target ? [target.far, target.near] : []),
        ].filter(([x, y], i, all) => !i || x !== all[i - 1][0] || y !== all[i - 1][1]);
        const segment = (start, end) => svg `<line x1="${start[0]}" y1="${start[1]}" x2="${end[0]}" y2="${end[1]}"
                stroke-linecap="square" stroke="currentColor" />`;
        // draw a line between each consecutive pair of points
        const lines = previewPoints
            .slice(1)
            .map((point, index) => segment(previewPoints[index], point));
        const dropTarget = svg `<rect width="100%" height="100%" fill="url(#grid)"
      @click=${() => {
            if (wireNode && wireRoute) {
                this.dispatchEvent(newConnectEvent({
                    from,
                    fromTerminal,
                    path: finishRoute(path, wireRoute),
                    to: wireNode,
                }));
                return;
            }
            if (!route) {
                return;
            }
            const newPath = target
                ? finishRoute(path, route, target.far, target.near)
                : extendRoute(path, route);
            this.dispatchEvent(newExtendConnectPointEvent(newPath));
            if (target) {
                this.dispatchEvent(newConnectEvent({
                    from,
                    fromTerminal,
                    path: newPath,
                    to: target.to,
                    toTerminal: target.toTerminal,
                }));
            }
        }} />`;
        return [...lines, dropTarget];
    }
    /**
     * While a connection is being drawn in this substation, every
     * `ConductingEquipment` and `PowerTransformer` is suppressed in its container
     * layer (see conducting-equipment.ts, power-transformer.ts) and re-painted
     * here as a flat top overlay in connect mode: terminal connect-indicators on,
     * and click-through enabled so clicks fall through to the connection
     * drop-target beneath.
     */
    renderConnectModeEquipmentLayer() {
        if (this.connecting?.from.closest('Substation') !== this.substation) {
            return nothing;
        }
        return [
            ...Array.from(this.substation.querySelectorAll('ConductingEquipment')).map(eq => this.renderEquipment(eq, { connect: true })),
            ...Array.from(this.substation.querySelectorAll('PowerTransformer')).map(transformer => this.renderPowerTransformer(transformer, { connect: true })),
        ];
    }
    renderConnectivityLayer() {
        return Array.from(this.substation.querySelectorAll('ConnectivityNode'))
            .filter(node => node.getAttribute('name') !== 'grounded' &&
            !this.isPartOfPlacingElement(node))
            .sort((a, b) => Number(isBusBar(a.parentElement)) -
            Number(isBusBar(b.parentElement)))
            .map(cNode => this.renderConnectivityNode(cNode));
    }
    renderPowerTransformerLayer() {
        return Array.from(this.substation.querySelectorAll(':scope > PowerTransformer')).map(transformer => this.renderPowerTransformer(transformer));
    }
    renderIedLayer() {
        return iedReferences(this.substation)
            .filter(referencedIed => referencedIed.parentElement?.tagName === 'Private' &&
            !['Bay', 'VoltageLevel'].includes(referencedIed.parentElement.parentElement.tagName) &&
            !this.isPartOfPlacingElement(referencedIed))
            .map(ied => this.renderIed(ied));
    }
    renderLabelLayer() {
        return Array.from(this.substation.querySelectorAll('VoltageLevel, Bay, ConductingEquipment, PowerTransformer, Text'))
            .concat(Array.from(this.substation.querySelectorAll('Private[type="OpenSCD-SLD-Layout"]') ?? []).flatMap(privateLayout => iedReferences(privateLayout)))
            .filter(e => !this.isPartOfPlacingElement(e))
            .map(element => this.renderLabel(element));
    }
    containerContext() {
        return {
            ...this.sharedContext(),
            highlight: this.highlight,
            dragAnchor: this.dragAnchor,
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            svgCoordinates: (clientX, clientY) => this.svgCoordinates(clientX, clientY),
            renderEquipment: equipment => this.renderEquipment(equipment),
            renderPowerTransformer: equipment => this.renderPowerTransformer(equipment),
            renderIed: (referencedIed, options) => this.renderIed(referencedIed, options),
            renderConnectivityNode: cNode => this.renderConnectivityNode(cNode),
        };
    }
    renderPowerTransformer(transformer, options = {}) {
        return this.renderArtifact(powerTransformerArtifact, transformer, this.powerTransformerContext(), options);
    }
    sharedContext() {
        return {
            disabled: this.disabled,
            dispatch: event => this.dispatchEvent(event),
            gridPosition: event => this.gridPosition(event),
            halfGridPosition: event => this.halfGridPosition(event),
            interaction: this.interaction,
            requestContextMenu: (element, event) => this.requestContextMenu(element, event),
            resolveIed: referencedIed => this.resolveIed(referencedIed),
            renderedLabelPosition: (element, options) => this.renderedLabelPosition(element, options),
            renderedPosition: element => this.renderedPosition(element),
            selectable: this.selectable,
            substation: this.substation,
            view: {
                showLabels: this.showLabels,
                showIeds: this.showIeds,
            },
        };
    }
    equipmentContext() {
        return {
            ...this.sharedContext(),
            groundTerminal: (element, terminal) => this.groundTerminal(element, terminal),
            highlight: this.highlight,
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            nearestOpenTerminal: equipment => this.nearestOpenTerminal(equipment),
        };
    }
    busBarContext() {
        return this.connectivityNodeContext();
    }
    powerTransformerContext() {
        return {
            ...this.sharedContext(),
            connectTarget: this.connectTarget,
            groundTerminal: (element, terminal) => this.groundTerminal(element, terminal),
            highlight: this.highlight,
            mouseX: this.mouseX,
            mouseY: this.mouseY,
        };
    }
    renderArtifact(descriptor, element, context, options = {}) {
        const state = descriptor.state(element, context, options);
        if (!state) {
            return svg ``;
        }
        return descriptor.render(element, state, descriptor.actions(element, context, state), context, options);
    }
    renderEquipment(equipment, options = {}) {
        return this.renderArtifact(conductingEquipmentArtifact, equipment, this.equipmentContext(), options);
    }
    renderIed(referencedIed, { preview = false } = {}) {
        return this.renderArtifact(iedReferenceArtifact, referencedIed, this.sharedContext(), { preview });
    }
    renderBusBar(busBar) {
        return this.renderArtifact(busBarArtifact, busBar, this.busBarContext());
    }
    connectivityNodeContext() {
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
    /**
     * Where the connections to the element being placed would run if it were
     * dropped where it is now.
     */
    plannedReroutes() {
        const resizing = this.resizingBusBar;
        if (resizing) {
            const rect = this.busBarResizeRect();
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
        if (this.interaction.mode === 'movingJunction') {
            const { element: cNode, point: from } = this.interaction;
            const to = [this.mouseX2, this.mouseY2];
            const key = [cNode, this.docVersion, ...from, ...to];
            if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
                this.reroutePreview = {
                    key,
                    routes: cNode.getRootNode() === this.doc
                        ? planReroutes(this.doc, { kind: 'junction', element: cNode, from, to })
                        : [],
                };
            }
            return this.reroutePreview.routes;
        }
        if (this.interaction.mode === 'reroutingSection') {
            const section = this.interaction.element;
            const via = [this.mouseX2, this.mouseY2];
            const key = [section, this.docVersion, ...via];
            if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
                this.reroutePreview = {
                    key,
                    routes: section.getRootNode() === this.doc
                        ? planReroutes(this.doc, { kind: 'section', element: section, via })
                        : [],
                };
            }
            return this.reroutePreview.routes;
        }
        const { placing } = this;
        if (!placing ||
            placing.getRootNode() !== this.doc ||
            placing.closest('Substation') !== this.substation ||
            placing.localName === 'Vertex') {
            return [];
        }
        const [x, y] = this.renderedPosition(placing);
        const { pos: [oldX, oldY], } = attributes(placing);
        const [dx, dy] = [x - oldX, y - oldY];
        if (!dx && !dy) {
            return [];
        }
        const key = [placing, this.docVersion, dx, dy];
        if (key.some((k, i) => k !== this.reroutePreview.key[i])) {
            const change = { kind: 'move', element: placing, dx, dy };
            const planned = planReroutes(this.doc, change);
            this.reroutePreview = {
                key,
                routes: [
                    ...planned,
                    ...overlappedSections(this.doc, change, new Set(planned.map(route => route.section))).map(flagged => ({ ...flagged, fallback: true })),
                ],
            };
        }
        return this.reroutePreview.routes;
    }
    /** The wire whose connection a new connection from its terminal replaces, or the bus bar being resized. */
    replacedSections() {
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
            ? Array.from(this.substation.getElementsByTagNameNS(sldNs, 'Vertex')).find(candidate => getSLDAttributes(candidate, 'uuid') === uuid)
            : undefined;
        return vertex?.parentElement ? [vertex.parentElement] : [];
    }
    hideSections(sections) {
        if (sections.length !== this.hiddenSections.size ||
            sections.some(section => !this.hiddenSections.has(section))) {
            this.hiddenSections = new Set(sections);
        }
    }
    renderReroutePreviewLayer(routes) {
        return routes.map(({ points, fallback }) => svg `<polyline fill="none" stroke-linecap="square" pointer-events="none"
          points="${points.map(point => point.join(',')).join(' ')}"
          stroke="${fallback ? 'var(--oscd-sld-routing-warning-color)' : 'currentColor'}"
          stroke-dasharray="${fallback ? '0.15 0.1' : nothing}" />`);
    }
    /** Catches the click that places the point a wire being re-routed goes through. */
    renderRerouteTarget() {
        if (this.disabled || this.interaction.mode !== 'reroutingSection') {
            return nothing;
        }
        const section = this.interaction.element;
        return svg `<rect width="100%" height="100%" fill="none" pointer-events="all"
      @click=${() => this.dispatchEvent(newRerouteSectionEvent({
            section,
            via: [this.mouseX2, this.mouseY2],
        }))} />`;
    }
    /** The junction being moved, at the cursor, and the click that puts it there. */
    renderJunctionTarget() {
        if (this.disabled || this.interaction.mode !== 'movingJunction') {
            return nothing;
        }
        const { element: cNode, point: from } = this.interaction;
        if (cNode.closest('Substation') !== this.substation) {
            return nothing;
        }
        const to = [this.mouseX2, this.mouseY2];
        return svg `<circle fill="currentColor" cx="${to[0]}" cy="${to[1]}" r="0.15"
        pointer-events="none" />
      <rect width="100%" height="100%" fill="none" pointer-events="all"
        @click=${() => this.dispatchEvent(newMoveJunctionEvent({ cNode, from, to }))} />`;
    }
    /** The middle of where a wire first runs through equipment, or else of its longest leg. */
    warningAnchor(section, points) {
        const attached = new Set(Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).flatMap((vertex) => {
            const uuid = getSLDAttributes(vertex, 'uuid');
            return uuid
                ? Array.from(this.substation.querySelectorAll('Terminal, NeutralPoint'))
                    .filter(terminal => getSLDAttributes(terminal, 'uuid') === uuid)
                    .map(terminal => terminal.closest('ConductingEquipment, PowerTransformer'))
                : [];
        }));
        const boxes = [
            ...Array.from(this.substation.querySelectorAll('ConductingEquipment, PowerTransformer')),
            ...iedReferences(this.substation),
        ]
            .filter(element => !attached.has(element))
            .flatMap(element => obstacleRects(element));
        const legs = points
            .slice(1)
            .map((end, i) => [points[i], end]);
        const middle = ([a, b]) => [
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2,
        ];
        for (const [start, end] of legs) {
            const [lx, hx] = [Math.min(start[0], end[0]), Math.max(start[0], end[0])];
            const [ly, hy] = [Math.min(start[1], end[1]), Math.max(start[1], end[1])];
            const box = boxes.find(([x, y, w, h]) => hx > x && lx < x + w && hy > y && ly < y + h);
            if (box) {
                const [x, y, w, h] = box;
                return middle([
                    [Math.max(lx, x), Math.max(ly, y)],
                    [Math.min(hx, x + w), Math.min(hy, y + h)],
                ]);
            }
        }
        const [longest] = [...legs].sort(([a, b], [c, d]) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) -
            (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])));
        return middle(longest);
    }
    /** Marks wires that were routed through other elements; hovering traces the wire, a click dismisses the mark. */
    renderRoutingWarnings() {
        if (this.disabled || !isMode(this.interaction, 'idle')) {
            return nothing;
        }
        return this.routingWarnings
            .filter(section => section.closest('Substation') === this.substation)
            .flatMap((section) => {
            const points = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(vertex => attributes(vertex).pos);
            if (points.length < 2) {
                return [];
            }
            const dismiss = (event) => {
                event.stopPropagation();
                this.dispatchEvent(newDismissRoutingWarningEvent(section));
            };
            const [x, y] = this.warningAnchor(section, points);
            return [
                svg `<g class="routing-warning" role="button" style="cursor: pointer"
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
    connectionRouter(mode = 'strict') {
        const key = [this.substation, this.docVersion];
        if (!this.routerCache || key.some((k, i) => k !== this.routerCache.key[i])) {
            const obstacles = [
                ...Array.from(this.substation.querySelectorAll('ConductingEquipment, PowerTransformer')),
                ...iedReferences(this.substation),
            ].flatMap(element => obstacleRects(element));
            const wires = Array.from(this.substation.querySelectorAll('ConnectivityNode')).flatMap(cNode => wirePolylines(cNode).map(wire => ({ net: cNode, ...wire })));
            const { dim: [w, h], } = attributes(this.substation);
            this.routerCache = {
                key,
                build: routerMode => new ConnectionRouter(w, h, obstacles, wires, routerMode),
                routers: {},
            };
        }
        const { routers, build } = this.routerCache;
        routers[mode] ??= build(mode);
        return routers[mode];
    }
    /** Where a route begins; a connection just started from a winding first leaves the areas of its transformer. */
    routeStart(path) {
        const transformer = path.length === 2 && this.connecting?.from.closest('PowerTransformer');
        return transformer
            ? leaveRects(connectAnchor(path), connectHeading(path), obstacleRects(transformer))
            : connectAnchor(path);
    }
    /**
     * Routes the connection being drawn from its last anchor to `target`. Where
     * there is no room to leave the equipment straight, it may turn on the
     * equipment's border instead and end at `tightTarget`.
     */
    routeConnection(path, target, tightTarget = target) {
        if (!this.connecting) {
            return undefined;
        }
        const [anchor, direction, own] = [
            this.routeStart(path),
            connectHeading(path),
            path.slice(0, -1),
        ];
        return (this.connectionRouter().route(anchor, direction, target, own) ??
            this.connectionRouter('tight').route(anchor, direction, tightTarget, own));
    }
    /**
     * Routes the connection being drawn to the nearest place it can meet the
     * wires of `cNode`, or to the bend or free end under the cursor.
     */
    routeToConnectivityNode(path, cNode) {
        if (!this.connecting) {
            return undefined;
        }
        const route = (mode) => this.connectionRouter(mode).routeToNet(this.routeStart(path), connectHeading(path), cNode, path.slice(0, -1), [this.mouseX2, this.mouseY2]);
        return route('strict') ?? route('tight');
    }
    /** The topmost connectable connectivity node whose wire runs under `cursor`. */
    connectivityNodeAt([x, y]) {
        const owner = this.connecting.from.closest('ConductingEquipment, PowerTransformer');
        const own = this.connecting.from.closest('ConnectivityNode');
        return Array.from(this.substation.querySelectorAll('ConnectivityNode'))
            .filter(cNode => cNode.getAttribute('name') !== 'grounded' &&
            cNode !== own &&
            !owner?.querySelector(`[connectivityNode="${cNode.getAttribute('pathName')}"]`) &&
            wirePolylines(cNode).some(({ points }) => points.slice(1).some(([x2, y2], i) => {
                const [x1, y1] = points[i];
                return ((y === y1 && y === y2 && (x - x1) * (x - x2) <= 0) ||
                    (x === x1 && x === x2 && (y - y1) * (y - y2) <= 0));
            })))
            .sort((a, b) => Number(isBusBar(a.parentElement)) -
            Number(isBusBar(b.parentElement)))
            .pop();
    }
    renderConnectivityNode(cNode) {
        return renderArtifactConnectivityNode(cNode, this.connectivityNodeContext());
    }
}
SldSubstationViewer.scopedElements = {};
SldSubstationViewer.styles = [
    sldThemeStyles,
    css `
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
__decorate([
    state()
], SldSubstationViewer.prototype, "dragAnchor", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "doc", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "substation", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "docVersion", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "gridSize", void 0);
__decorate([
    property({ attribute: false })
], SldSubstationViewer.prototype, "interaction", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "showLabels", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "showIeds", void 0);
__decorate([
    property({ type: Boolean })
], SldSubstationViewer.prototype, "disabled", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "selectable", void 0);
__decorate([
    property()
], SldSubstationViewer.prototype, "highlight", void 0);
__decorate([
    property({ attribute: false })
], SldSubstationViewer.prototype, "routingWarnings", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "idle", null);
__decorate([
    query('svg#sld')
], SldSubstationViewer.prototype, "sld", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseX", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseY", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseX2", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseY2", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseX2f", void 0);
__decorate([
    state()
], SldSubstationViewer.prototype, "mouseY2f", void 0);
//# sourceMappingURL=sld-substation-viewer.js.map