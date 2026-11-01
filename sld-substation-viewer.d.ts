import { nothing, LitElement, PropertyValues, SVGTemplateResult } from 'lit';
import { DragToClickController } from './drag-to-click.js';
import type { Point } from './foundations/geometry.js';
import type { InteractionState } from './foundations/interaction-mode.js';
import type { StartConnectDetail } from './foundations/events.js';
import type { Style } from './foundations/sld-attributes.js';
declare const SldSubstationViewer_base: typeof LitElement & import("@open-wc/dedupe-mixin").Constructor<import("@open-wc/scoped-elements/types.js").ScopedElementsHost> & import("@open-wc/scoped-elements/types.js").ScopedElementsHostConstructor;
/** An editor [[`plugin`]] for editing the `Substation` section. */
export declare class SldSubstationViewer extends SldSubstationViewer_base {
    static scopedElements: {};
    protected dragToClick: DragToClickController;
    protected dragOut: DragToClickController;
    /** Grid cell where a drag-out began; the opposite corner follows the cursor. */
    dragAnchor?: Point;
    doc: XMLDocument;
    substation: Element;
    docVersion: number;
    gridSize: number;
    get nsp(): string;
    interaction: InteractionState;
    /**
     * The following read-only getters project the single {@link interaction}
     * value into the per-gesture shapes the render layers and drawing artifacts
     * consume. The view stores no interaction state of its own — it derives these
     * from the one `interaction` property supplied by the controller.
     */
    get placing(): Element | undefined;
    get placingOffset(): Point;
    get placingLabel(): Element | undefined;
    get resizingTL(): Element | undefined;
    /** The bus bar being resized, and the end of it that follows the cursor. */
    private get resizingBusBar();
    /** The cells the bus bar being resized would cover with its end at the cursor. */
    private busBarResizeRect;
    get connecting(): StartConnectDetail | undefined;
    showLabels?: boolean;
    showIeds?: boolean;
    disabled: boolean;
    selectable: string[];
    highlight: {
        id: string;
        style: Style;
    }[];
    /** Sections that were routed through other elements to stay connected. */
    routingWarnings: Element[];
    get idle(): boolean;
    /**
     * True when `element` is, or is contained by, the element currently being
     * placed. Such an element moves with the cursor as the placing-preview ghost,
     * so the base layers suppress it (the preview paints it instead) and the
     * position helpers apply the live mouse offset to it. This is the one way a
     * base layer's appearance is parameterised by the placing mode.
     */
    private isPartOfPlacingElement;
    sld: SVGGraphicsElement;
    mouseX: number;
    mouseY: number;
    private iedResolutionCache;
    private connectTarget;
    protected willUpdate(changedProperties: PropertyValues<this>): void;
    protected shouldUpdate(changedProperties: PropertyValues<this>): boolean;
    private resolveIed;
    mouseX2: number;
    mouseY2: number;
    mouseX2f: number;
    mouseY2f: number;
    svgCoordinates(clientX: number, clientY: number): Point;
    gridPosition(event: MouseEvent): Point;
    halfGridPosition(event: MouseEvent): Point;
    /** Top-left of the element being placed: the cursor, or the dragged-out corner. */
    private placingCorner;
    renderedLabelPosition(element: Element, { preview }?: {
        preview?: boolean | undefined;
    }): Point;
    renderedPosition(element: Element): Point;
    /**
     * Returns the substation's diagram as an export-ready SVG string.
     * The viewer alone knows how it constructs the SVG and which nodes are
     * editing chrome, so it owns normalization/serialization; the editor decides
     * what to do with the result (e.g. trigger a file download).
     */
    exportableSvg(): string;
    nearestOpenTerminal(equipment?: Element): 'T1' | 'T2' | undefined;
    groundTerminal(equipment: Element, name: 'T1' | 'T2' | 'N1' | 'N2'): void;
    requestContextMenu(element: Element, event: MouseEvent): void;
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
    render(): import("lit-html").TemplateResult<1>;
    renderLabel(element: Element, { preview }?: {
        preview?: boolean | undefined;
    }): SVGTemplateResult | typeof nothing;
    /**
     * The VoltageLevel drop-zone, painted near the BACK of the stack (behind
     * existing voltage levels) — a VL is dropped *behind* the diagram. Mutually
     * exclusive with `renderPlacingTargetsLayer` (only one placing mode at a time).
     */
    private renderVoltageLevelPlacingTarget;
    /**
     * The full-canvas drop-targets for elements that may land anywhere in the
     * substation (PowerTransformer / IED / Label), painted near the FRONT of the
     * stack so they catch clicks over existing elements. All three are mutually
     * exclusive (gated on the active placing mode), so at most one is live.
     */
    private renderPlacingTargetsLayer;
    private renderPlacingPreview;
    /** A thick line for a bus bar over `rect`; its cells can be clicked to commit. */
    private renderBusBarLine;
    /** A new bus bar being dragged out from the cell `anchor` to the cursor. */
    private renderDraggedBusBar;
    /** The bus bar as it would run with its end at the cursor, and its junctions. */
    private renderBusBarResizePreview;
    /** Catches the click that sizes the bus bar being resized. */
    private renderBusBarResizeTarget;
    private renderVoltageLevelLayer;
    /**
     * What the connection being drawn would end on at the current cursor: the
     * hovered conducting equipment (by grid cell) with an open terminal, else the
     * nearest open winding terminal. Resolved once per render, see `render()`.
     */
    private resolveConnectTarget;
    private renderConnectionPreviewLayer;
    /**
     * While a connection is being drawn in this substation, every
     * `ConductingEquipment` and `PowerTransformer` is suppressed in its container
     * layer (see conducting-equipment.ts, power-transformer.ts) and re-painted
     * here as a flat top overlay in connect mode: terminal connect-indicators on,
     * and click-through enabled so clicks fall through to the connection
     * drop-target beneath.
     */
    private renderConnectModeEquipmentLayer;
    private renderConnectivityLayer;
    private renderPowerTransformerLayer;
    private renderIedLayer;
    private renderLabelLayer;
    private containerContext;
    renderPowerTransformer(transformer: Element, options?: {
        preview?: boolean;
        connect?: boolean;
    }): SVGTemplateResult;
    private sharedContext;
    private equipmentContext;
    private busBarContext;
    private powerTransformerContext;
    private renderArtifact;
    renderEquipment(equipment: Element, options?: {
        preview?: boolean;
        connect?: boolean;
    }): SVGTemplateResult;
    renderIed(referencedIed: Element, { preview }?: {
        preview?: boolean | undefined;
    }): SVGTemplateResult;
    renderBusBar(busBar: Element): SVGTemplateResult;
    private connectivityNodeContext;
    private reroutePreview;
    /**
     * Where the connections to the element being placed would run if it were
     * dropped where it is now.
     */
    private plannedReroutes;
    /** The sections drawn as previews; kept the same set while they are the same sections. */
    private hiddenSections;
    /** The wire whose connection a new connection from its terminal replaces, or the bus bar being resized. */
    private replacedSections;
    private hideSections;
    private renderReroutePreviewLayer;
    /** Catches the click that places the point a wire being re-routed goes through. */
    private renderRerouteTarget;
    /** The junction being moved, at the cursor, and the click that puts it there. */
    private renderJunctionTarget;
    /** The middle of where a wire first runs through equipment, or else of its longest leg. */
    private warningAnchor;
    /** Marks wires that were routed through other elements; hovering traces the wire, a click dismisses the mark. */
    private renderRoutingWarnings;
    private routerCache?;
    private connectionRouter;
    /** Where a route begins; a connection just started from a winding first leaves the areas of its transformer. */
    private routeStart;
    /**
     * Routes the connection being drawn from its last anchor to `target`. Where
     * there is no room to leave the equipment straight, it may turn on the
     * equipment's border instead and end at `tightTarget`.
     */
    private routeConnection;
    /**
     * Routes the connection being drawn to the nearest place it can meet the
     * wires of `cNode`, or to the bend or free end under the cursor.
     */
    private routeToConnectivityNode;
    /** The topmost connectable connectivity node whose wire runs under `cursor`. */
    private connectivityNodeAt;
    renderConnectivityNode(cNode: Element): SVGTemplateResult | typeof nothing;
    static styles: import("lit").CSSResult[];
}
export {};
