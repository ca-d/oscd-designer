export function newResizeEvent(detail) {
    return new CustomEvent('oscd-sld-resize', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newResizeTLEvent(detail) {
    return new CustomEvent('oscd-sld-resize-tl', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newPlaceEvent(detail) {
    return new CustomEvent('oscd-sld-place', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newPlaceLabelEvent(detail) {
    return new CustomEvent('oscd-sld-place-label', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newConnectEvent(detail) {
    return new CustomEvent('oscd-sld-connect', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newExtendConnectPointEvent(path) {
    return new CustomEvent('oscd-sld-extend-connect-point', {
        bubbles: true,
        composed: true,
        detail: { path },
    });
}
export function newRotateEvent(detail) {
    return new CustomEvent('oscd-sld-rotate', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newFlipEvent(detail) {
    return new CustomEvent('oscd-sld-flip', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newStartInteractionEvent(detail) {
    return new CustomEvent('oscd-sld-start-interaction', {
        bubbles: true,
        composed: true,
        detail,
    });
}
/** The wire `section` is to be routed through the point `via`. */
export function newRerouteSectionEvent(detail) {
    return new CustomEvent('oscd-sld-reroute-section', {
        bubbles: true,
        composed: true,
        detail,
    });
}
/** The junction at `from` of the connectivity node `cNode` is to go to `to`. */
export function newMoveJunctionEvent(detail) {
    return new CustomEvent('oscd-sld-move-junction', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newSelectEvent(element) {
    return new CustomEvent('oscd-sld-selected', {
        bubbles: true,
        composed: true,
        detail: { element },
    });
}
export function newSclEditDialogEvent(element) {
    return new CustomEvent('oscd-sld-edit-scl', {
        bubbles: true,
        composed: true,
        detail: { element },
    });
}
export function newGroundTerminalEvent(equipment, terminal) {
    return new CustomEvent('oscd-sld-ground-terminal', {
        bubbles: true,
        composed: true,
        detail: { equipment, terminal },
    });
}
export function newOpenContextMenuEvent(detail) {
    return new CustomEvent('oscd-sld-open-context-menu', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newEditIedEvent(element) {
    return new CustomEvent('oscd-sld-edit-ied', {
        bubbles: true,
        composed: true,
        detail: { element },
    });
}
export function newSubstationResizeEvent(substation) {
    return new CustomEvent('oscd-sld-substation-resize', {
        bubbles: true,
        composed: true,
        detail: substation,
    });
}
export function newSubstationDeleteEvent(substation) {
    return new CustomEvent('oscd-sld-substation-delete', {
        bubbles: true,
        composed: true,
        detail: substation,
    });
}
export function newSubstationExportEvent(substation) {
    return new CustomEvent('oscd-sld-substation-export', {
        bubbles: true,
        composed: true,
        detail: substation,
    });
}
export function newGroundHintEvent() {
    return new CustomEvent('oscd-sld-ground-hint', {
        bubbles: true,
        composed: true,
    });
}
export function newDismissRoutingWarningEvent(section) {
    return new CustomEvent('oscd-sld-dismiss-routing-warning', {
        bubbles: true,
        composed: true,
        detail: section,
    });
}
export function newInActionEvent(active) {
    return new CustomEvent('oscd-sld-in-action', {
        bubbles: true,
        composed: true,
        detail: active,
    });
}
//# sourceMappingURL=events.js.map