import { __decorate } from "tslib";
import { html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';
import { newEditEventV2 } from '@openscd/oscd-api/utils.js';
import { OscdSclDialogs } from '@omicronenergy/oscd-scl-dialogs/oscd-scl-dialogs.js';
import { OscdSnackbar } from '@omicronenergy/oscd-ui/snackbar/OscdSnackbar.js';
import { SldSubstationViewer } from './sld-substation-viewer.js';
import { SldSubstationHeader } from './sld-substation-header.js';
import { SldResizeSubstationDialog } from './sld-resize-substation-dialog.js';
import { SldContextMenu } from './context-menu/sld-context-menu.js';
import { SldCoordinateTooltip } from './sld-coordinate-tooltip.js';
import { attributes, getSLDAttributes } from './foundations/sld-attributes.js';
import { createConnectEdits, createGroundTerminalEdits, createPlaceLabelEdit, createResizeEdits, createResizeTLEdits, createFlipElementEdits, createRotateEdits, disconnectExternalEdits, leavesSubstation, rewireTerminalEdits, shiftDescendantEdits, shiftElementEdits, shiftTextEdits, wrapIedReferenceEdits, } from './foundations/edits.js';
import { removeTerminal } from './foundations/connectivity-edits.js';
import { pointsSignature, rerouteEdits, sectionEnds, sectionSignature, } from './foundations/rerouting.js';
import { busBarLineEdits, busBarResizeEdits, } from './foundations/bus-bar-edits.js';
import { isBusBar } from './foundations/connectivity.js';
import { iedReferences, isIedReferenceElement, resolveIed, } from './foundations/ied.js';
import { reparentElement, sldNs, sldPrefix } from './foundations.js';
import { downloadSvg } from './foundations/export.js';
import { copyElementForPlacement } from './foundations/placement-clone.js';
import { newInActionEvent } from './foundations/events.js';
import * as interactions from './foundations/interaction-mode.js';
export class SldEditor extends ScopedElementsMixin(LitElement) {
    constructor() {
        super(...arguments);
        this._docVersion = 0;
        this.disabled = false;
        this.selectable = [];
        this.highlight = [];
        this.gridSize = 32;
        this.interaction = interactions.idle();
        this.showLabels = true;
        this.handleKeydown = ({ key }) => {
            if (key === 'Escape') {
                this.cancelInteraction();
            }
        };
        /**
         * Sections that had to run through other elements to stay connected, with the
         * geometry they were given. A warning only shows while the section still has
         * that geometry, so editing or undoing it clears the warning.
         */
        this.routingWarnings = new Map();
        this.handleDismissRoutingWarning = ({ detail, }) => {
            this.routingWarnings.delete(detail);
            this.requestUpdate();
        };
        this.handleGroundTerminal = (event) => {
            const { equipment, terminal } = event.detail;
            const edits = createGroundTerminalEdits(equipment, terminal);
            if (!edits) {
                this.handleGroundHint();
                return;
            }
            this.dispatchEvent(newEditEventV2(edits));
        };
        this.handleOpenContextMenu = (event) => {
            this.contextMenu.open(event.detail);
        };
        this.handleEditScl = (event) => {
            const detail = event.detail;
            return this.editScl(detail.element);
        };
        this.handleEditIed = async (event) => {
            const { element: sclIed } = event.detail;
            const edits = await this.sclDialogs.edit({ element: sclIed });
            const iedReference = iedReferences(this.doc).find(iedRef => resolveIed(iedRef) === sclIed);
            if (!iedReference) {
                this.dispatchEvent(newEditEventV2([edits], {
                    title: 'Update IED',
                    squash: false,
                }));
                return;
            }
            const iedNameEdit = [...edits.flat()].find(edit => 'element' in edit &&
                edit.element.tagName === 'IED' &&
                'attributes' in edit &&
                !!edit.attributes &&
                'name' in edit.attributes);
            if (!iedNameEdit) {
                return;
            }
            const newIedName = iedNameEdit.attributes.name;
            const iedReferenceEdit = {
                element: iedReference,
                attributesNS: {
                    [sldNs]: {
                        [`${this.nsp}:id`]: newIedName,
                    },
                },
            };
            this.dispatchEvent(newEditEventV2([edits, iedReferenceEdit], {
                title: 'Update IED from dialog',
                squash: false,
            }));
        };
        /**
         * Resolves a coordinate surface to its SCL `Substation`. A surface is the root
         * `svg#sld` of a substation viewer; its shadow host is the viewer, which
         * carries the substation. Passed to the single coordinate tooltip so it can
         * identify which substation the cursor is over without the editor tracking
         * pointer movement itself.
         */
        this.substationOf = (surface) => {
            if (!(surface instanceof SVGSVGElement) || surface.id !== 'sld') {
                return undefined;
            }
            const root = surface.getRootNode();
            const host = root instanceof ShadowRoot ? root.host : undefined;
            return host instanceof SldSubstationViewer ? host.substation : undefined;
        };
    }
    get docVersion() {
        return this._docVersion;
    }
    set docVersion(value) {
        const i = this.interaction;
        if (i.mode === 'connectingFrom' ||
            (i.mode === 'resizingBR' && !i.element.parentElement) ||
            (i.mode === 'resizingTL' && !i.element.parentElement) ||
            (i.mode === 'placingLabel' && !i.element.parentElement)) {
            this.interaction = interactions.idle();
        }
        this._docVersion = value;
    }
    get nsp() {
        return sldPrefix(this.doc);
    }
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this.handleKeydown);
        this.addEventListener('oscd-sld-edit-scl', this.handleEditScl);
        this.addEventListener('oscd-sld-edit-ied', this.handleEditIed);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('oscd-sld-edit-scl', this.handleEditScl);
        this.removeEventListener('oscd-sld-edit-ied', this.handleEditIed);
    }
    /**
     * The two genuine consequences of an interaction transition, driven reactively
     * off the `interaction` `@state` rather than hand-orchestrated at every
     * assignment site: (1) resolve a still-pending placement promise when leaving
     * `placing` (a successful place opts out by clearing `_resolvePlacement`
     * first); (2) emit the derived `oscd-sld-in-action` boolean, but only when
     * the active/idle state actually flips — no more start-then-reset flap.
     */
    updated(changed) {
        if (!changed.has('interaction')) {
            return;
        }
        const previous = changed.get('interaction');
        if (previous?.mode === 'placing' && this.interaction.mode !== 'placing') {
            this._resolvePlacement?.(undefined);
            this._resolvePlacement = undefined;
        }
        const wasActive = !!previous && previous.mode !== 'idle';
        const isActive = this.interaction.mode !== 'idle';
        if (wasActive !== isActive) {
            this.dispatchEvent(newInActionEvent(isActive));
        }
    }
    /**
     * The single public entry for interaction *intents* — from the editor's own
     * views (via bubbling `oscd-sld-start-interaction`) and, bridged by the host,
     * from the sibling toolbar. Keeping every begin-transition behind this one
     * method (rather than letting callers assign `interaction` or call
     * `startPlacing` directly) makes the editor the sole owner of its interaction
     * state. Returns the placement promise for the `placing` case so a caller
     * orchestrating a follow-up (e.g. the host inserting IEDs after a bay-typical
     * placement) can await the result; other modes return `void`.
     */
    handleStartInteraction(intent) {
        switch (intent.mode) {
            case 'placing':
                return this.startPlacing(intent.copy
                    ? copyElementForPlacement(intent.element, this.nsp)
                    : intent.element, intent.offset);
            case 'placingLabel':
                this.interaction = interactions.placingLabel(intent.element, intent.offset ?? [0, 0]);
                break;
            case 'resizingBR':
                this.interaction = interactions.resizingBR(intent.element);
                break;
            case 'resizingTL':
                this.interaction = interactions.resizingTL(intent.element);
                break;
            case 'connecting':
                this.interaction = interactions.connectingFrom(intent.from, intent.fromTerminal, intent.path);
                break;
            case 'reroutingSection':
                this.startReroutingSection(intent.element);
                break;
        }
        return undefined;
    }
    handlePlace(element, parent, x, y, w, h) {
        const { pos: [oldX, oldY], } = attributes(element);
        const dx = x - oldX;
        const dy = y - oldY;
        const isNew = this.isNewBayOrVL(element);
        const sized = isNew && w !== undefined && h !== undefined;
        const edits = [];
        if (element.parentElement !== parent && !isIedReferenceElement(element)) {
            edits.push(...reparentElement(element, parent));
        }
        edits.push(...shiftElementEdits(element, x, y, this.nsp));
        edits.push(...shiftTextEdits(element, dx, dy, this.nsp));
        edits.push(...shiftDescendantEdits(element, dx, dy, this.nsp));
        edits.push(...rewireTerminalEdits(element, parent, this.doc));
        const fallbacks = [];
        if (leavesSubstation(element, parent)) {
            edits.push(...disconnectExternalEdits(element, this.doc));
        }
        else {
            edits.push(...rerouteEdits(this.doc, { kind: 'move', element, dx, dy }, this.nsp, fallbacks));
        }
        edits.push(...wrapIedReferenceEdits(element, parent, this.doc));
        if (sized) {
            edits.push(createResizeEdits(element, this.nsp, w, h));
            if (isBusBar(element)) {
                edits.push(...busBarLineEdits(element, [x, y, w, h], this.nsp));
            }
        }
        else if (isNew && isBusBar(element)) {
            // Sized right away, so that giving up on resizing leaves a proper bus bar.
            edits.push(createResizeEdits(element, this.nsp, 2, 1));
        }
        this.dispatchEvent(newEditEventV2(edits));
        this.warnAbout(fallbacks);
        const resolve = this._resolvePlacement;
        this._resolvePlacement = undefined;
        if (isNew && !sized) {
            this.interaction = interactions.resizingBR(element);
        }
        else {
            this.interaction = interactions.idle();
        }
        resolve?.({ element, parent, x, y });
    }
    handlePlaceLabel(element, x, y) {
        this.dispatchEvent(newEditEventV2(createPlaceLabelEdit(element, this.nsp, x, y)));
        this.interaction = interactions.idle();
    }
    handleResize(element, w, h) {
        if (isBusBar(element)) {
            const { pos: [x, y], } = attributes(element);
            this.resizeBusBar(element, [x, y, w, h]);
            return;
        }
        this.dispatchEvent(newEditEventV2(createResizeEdits(element, this.nsp, w, h)));
        this.interaction = interactions.idle();
    }
    handleResizeTL(element, x, y, w, h) {
        if (isBusBar(element)) {
            this.resizeBusBar(element, [x, y, w, h]);
            return;
        }
        this.dispatchEvent(newEditEventV2(createResizeTLEdits(element, this.nsp, x, y, w, h)));
        this.interaction = interactions.idle();
    }
    resizeBusBar(busBar, rect) {
        const fallbacks = [];
        this.dispatchEvent(newEditEventV2(busBarResizeEdits(this.doc, busBar, rect, this.nsp, fallbacks)));
        this.warnAbout(fallbacks);
        this.interaction = interactions.idle();
    }
    handleFlip(element) {
        const fallbacks = [];
        this.dispatchEvent(newEditEventV2(createFlipElementEdits(element, this.nsp, fallbacks)));
        this.warnAbout(fallbacks);
    }
    handleRotate(element) {
        const fallbacks = [];
        this.dispatchEvent(newEditEventV2(createRotateEdits(element, this.nsp, fallbacks)));
        this.warnAbout(fallbacks);
    }
    warnAbout(routes) {
        routes.forEach(route => this.routingWarnings.set(route.section, pointsSignature(route.points)));
        if (routes.length) {
            this.requestUpdate();
        }
    }
    activeRoutingWarnings(substation) {
        return Array.from(this.routingWarnings)
            .filter(([section, signature]) => section.closest('Substation') === substation &&
            sectionSignature(section) === signature)
            .map(([section]) => section);
    }
    /**
     * A wire held at both ends is moved by placing a point on its way. One with
     * a free end is not allowed to stay that way: it is drawn again from its
     * terminal, and replaced once it has found something to connect to.
     */
    startReroutingSection(section) {
        const ends = sectionEnds(section);
        if (!ends) {
            return;
        }
        if (!ends.some(end => end.free)) {
            this.interaction = interactions.reroutingSection(section);
            return;
        }
        const held = ends.find(end => !end.free);
        const terminal = held?.terminal;
        if (held?.port && terminal) {
            this.interaction = interactions.connectingFrom(terminal.parentElement, terminal.getAttribute('name'), [held.port.point, held.port.approach], terminal);
        }
    }
    handleRerouteSection({ section, via }) {
        const fallbacks = [];
        const edits = rerouteEdits(this.doc, { kind: 'section', element: section, via }, this.nsp, fallbacks);
        if (edits.length) {
            this.dispatchEvent(newEditEventV2(edits));
            this.warnAbout(fallbacks);
        }
        this.interaction = interactions.idle();
    }
    handleConnect(detail) {
        const replacing = this.interaction.mode === 'connectingFrom'
            ? this.interaction.replacing
            : undefined;
        const edits = [
            ...createConnectEdits(detail, this.doc, this.nsp),
            ...(replacing ? removeTerminal(replacing) : []),
        ];
        if (edits.length) {
            this.dispatchEvent(newEditEventV2(edits));
        }
        this.interaction = interactions.idle();
    }
    /**
     * Grow the in-progress connection path. The view reports the next path
     * (computed from the click + live cursor) and the controller — the single
     * owner of the interaction state — reassigns `interaction` immutably so Lit
     * reactivity is automatic and the value is never mutated behind its back.
     */
    handleExtendConnectPoint(path) {
        if (this.interaction.mode !== 'connectingFrom') {
            return;
        }
        this.interaction = interactions.connectingFrom(this.interaction.element, this.interaction.terminal, path);
    }
    handleGroundHint() {
        this.snackbar.show({
            message: 'Only transformers within a bay may be grounded directly.',
            variant: 'warning',
        });
    }
    handleSubstationResize(substation) {
        this.resizeDialog.show(substation);
    }
    handleSubstationDelete(substation) {
        this.dispatchEvent(newEditEventV2({ node: substation }));
    }
    handleSubstationExport(substation) {
        const viewer = Array.from(this.renderRoot.querySelectorAll('sld-substation-viewer')).find(candidate => candidate.substation === substation);
        if (!viewer) {
            return;
        }
        downloadSvg(viewer.exportableSvg(), `${substation.getAttribute('name')}.svg`);
    }
    /**
     * Begin placing `element`, returning a promise that resolves with the
     * placement result (or `undefined` if the placement is cancelled or
     * superseded). This is the one interaction wrapper that survives — it exists
     * solely to own the placement promise; every other mode is entered by
     * assigning `this.interaction` directly.
     */
    startPlacing(element, offset = [0, 0]) {
        if (this.disabled) {
            return Promise.resolve(undefined);
        }
        // A new placement supersedes any pending one (mode stays `placing`, so the
        // leave-`placing` handler in `updated()` would not catch it).
        this._resolvePlacement?.(undefined);
        this._resolvePlacement = undefined;
        this.interaction = element
            ? interactions.placing(element, offset)
            : interactions.idle();
        return new Promise((resolve) => {
            this._resolvePlacement = resolve;
        });
    }
    /**
     * Abort the current interaction, returning the editor to its idle resting
     * state. The host's toolbar cancel affordance requests this rather than
     * assigning `interaction` directly, keeping the editor the sole owner of its
     * interaction state.
     */
    cancelInteraction() {
        this.interaction = interactions.idle();
    }
    async editScl(element) {
        const edits = await this.sclDialogs.edit({ element });
        this.dispatchEvent(newEditEventV2(edits));
    }
    isNewBayOrVL(element) {
        return ['Bay', 'VoltageLevel'].includes(element.tagName) &&
            (!getSLDAttributes(element, 'w') || !getSLDAttributes(element, 'h'));
    }
    render() {
        return html `${Array.from(this.doc.querySelectorAll(':root > Substation')).map(substation => html `<sld-substation-viewer
            .doc=${this.doc}
            .docVersion=${this.docVersion}
            .substation=${substation}
            .gridSize=${this.gridSize}
            .interaction=${this.interaction}
            .showLabels=${this.showLabels}
            .showIeds=${this.showIeds}
            .disabled=${this.disabled}
            .selectable=${this.selectable}
            .highlight=${this.highlight}
            .routingWarnings=${this.activeRoutingWarnings(substation)}
            @oscd-sld-dismiss-routing-warning=${this.handleDismissRoutingWarning}
            @oscd-sld-substation-export=${({ detail }) => this.handleSubstationExport(detail)}
            @oscd-sld-start-interaction=${({ detail, }) => this.handleStartInteraction(detail)}
            @oscd-sld-ground-terminal=${(event) => {
            this.handleGroundTerminal(event);
        }}
            @oscd-sld-ground-hint=${() => {
            this.handleGroundHint();
        }}
            @oscd-sld-open-context-menu=${(event) => {
            this.handleOpenContextMenu(event);
        }}
            @oscd-sld-resize=${({ detail: { element, w, h } }) => {
            this.handleResize(element, w, h);
        }}
            @oscd-sld-resize-tl=${({ detail: { element, x, y, w, h }, }) => {
            this.handleResizeTL(element, x, y, w, h);
        }}
            @oscd-sld-place=${({ detail: { element, parent, x, y, w, h }, }) => this.handlePlace(element, parent, x, y, w, h)}
            @oscd-sld-place-label=${({ detail: { element, x, y }, }) => {
            this.handlePlaceLabel(element, x, y);
        }}
            @oscd-sld-connect=${({ detail }) => this.handleConnect(detail)}
            @oscd-sld-extend-connect-point=${({ detail, }) => this.handleExtendConnectPoint(detail.path)}
            @oscd-sld-rotate=${({ detail }) => this.handleRotate(detail)}
            @oscd-sld-flip=${({ detail }) => this.handleFlip(detail)}
            @oscd-sld-reroute-section=${({ detail }) => this.handleRerouteSection(detail)}
          >
            <sld-substation-header
              slot="header"
              .substation=${substation}
              ?disabled=${this.disabled}
              @oscd-sld-substation-resize=${({ detail, }) => this.handleSubstationResize(detail)}
              @oscd-sld-substation-delete=${({ detail, }) => this.handleSubstationDelete(detail)}
            ></sld-substation-header>
          </sld-substation-viewer>`)}
    <sld-coordinate-tooltip
      .interaction=${this.interaction}
      .substationOf=${this.substationOf}
    ></sld-coordinate-tooltip>
    <sld-resize-substation-dialog
      @oscd-sld-resize=${({ detail: { element, w, h } }) => {
            this.handleResize(element, w, h);
        }}
    ></sld-resize-substation-dialog>
    <sld-context-menu
      .doc=${this.doc}
      .nsp=${this.nsp}
      @oscd-sld-start-interaction=${({ detail }) => this.handleStartInteraction(detail)}
      @oscd-sld-rotate=${({ detail }) => this.handleRotate(detail)}
      @oscd-sld-flip=${({ detail }) => this.handleFlip(detail)}
      @oscd-sld-ground-hint=${() => {
            this.handleGroundHint();
        }}
      @oscd-sld-substation-resize=${({ detail }) => this.handleSubstationResize(detail)}
      @oscd-sld-substation-delete=${({ detail }) => this.handleSubstationDelete(detail)}
      @oscd-sld-substation-export=${({ detail }) => this.handleSubstationExport(detail)}
    ></sld-context-menu>
    <oscd-snackbar></oscd-snackbar>
    <oscd-scl-dialogs></oscd-scl-dialogs>`;
    }
}
SldEditor.scopedElements = {
    'sld-substation-viewer': SldSubstationViewer,
    'sld-substation-header': SldSubstationHeader,
    'sld-resize-substation-dialog': SldResizeSubstationDialog,
    'sld-context-menu': SldContextMenu,
    'sld-coordinate-tooltip': SldCoordinateTooltip,
    'oscd-scl-dialogs': OscdSclDialogs,
    'oscd-snackbar': OscdSnackbar,
};
__decorate([
    query('oscd-scl-dialogs')
], SldEditor.prototype, "sclDialogs", void 0);
__decorate([
    query('sld-resize-substation-dialog')
], SldEditor.prototype, "resizeDialog", void 0);
__decorate([
    query('sld-context-menu')
], SldEditor.prototype, "contextMenu", void 0);
__decorate([
    query('oscd-snackbar')
], SldEditor.prototype, "snackbar", void 0);
__decorate([
    property({ type: Object })
], SldEditor.prototype, "doc", void 0);
__decorate([
    property({ type: Number })
], SldEditor.prototype, "docVersion", null);
__decorate([
    state()
], SldEditor.prototype, "_docVersion", void 0);
__decorate([
    property({ type: Boolean })
], SldEditor.prototype, "disabled", void 0);
__decorate([
    property({ type: Array })
], SldEditor.prototype, "selectable", void 0);
__decorate([
    property({ type: Array })
], SldEditor.prototype, "highlight", void 0);
__decorate([
    property({ type: Boolean })
], SldEditor.prototype, "showIeds", void 0);
__decorate([
    state()
], SldEditor.prototype, "gridSize", void 0);
__decorate([
    state()
], SldEditor.prototype, "interaction", void 0);
__decorate([
    state()
], SldEditor.prototype, "showLabels", void 0);
//# sourceMappingURL=sld-editor.js.map