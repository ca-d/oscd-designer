import type { Point } from './geometry.js';

export type ResizeDetail = {
  w: number;
  h: number;
  element: Element;
};

export type ResizeEvent = CustomEvent<ResizeDetail>;

export function newResizeEvent(detail: ResizeDetail): ResizeEvent {
  return new CustomEvent('oscd-sld-resize', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ResizeTLDetail = {
  x: number;
  y: number;
  w: number;
  h: number;
  element: Element;
};

export type ResizeTLEvent = CustomEvent<ResizeTLDetail>;

export function newResizeTLEvent(detail: ResizeTLDetail): ResizeTLEvent {
  return new CustomEvent('oscd-sld-resize-tl', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type PlaceLabelDetail = {
  x: number;
  y: number;
  element: Element;
};

export type PlaceDetail = {
  x: number;
  y: number;
  element: Element;
  parent: Element;
};

export type PlaceEvent = CustomEvent<PlaceDetail>;

export function newPlaceEvent(detail: PlaceDetail): PlaceEvent {
  return new CustomEvent('oscd-sld-place', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type PlaceLabelEvent = CustomEvent<PlaceLabelDetail>;

export function newPlaceLabelEvent(detail: PlaceLabelDetail): PlaceLabelEvent {
  return new CustomEvent('oscd-sld-place-label', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ConnectDetail = {
  from: Element;
  path: Point[];
  fromTerminal: 'T1' | 'T2' | 'N1' | 'N2';
  to: Element;
  toTerminal?: 'T1' | 'T2' | 'N1' | 'N2';
};

export type ConnectEvent = CustomEvent<ConnectDetail>;

export function newConnectEvent(detail: ConnectDetail): ConnectEvent {
  return new CustomEvent('oscd-sld-connect', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ExtendConnectPointDetail = { path: Point[] };

export type ExtendConnectPointEvent = CustomEvent<ExtendConnectPointDetail>;

export function newExtendConnectPointEvent(
  path: Point[],
): ExtendConnectPointEvent {
  return new CustomEvent('oscd-sld-extend-connect-point', {
    bubbles: true,
    composed: true,
    detail: { path },
  });
}

export type StartEvent = CustomEvent<Element>;

export function newRotateEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-rotate', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type StartConnectDetail = {
  from: Element;
  fromTerminal: 'T1' | 'T2' | 'N1' | 'N2';
  path: Point[];
};

/**
 * Upward (view → controller) *intent* to begin a new interaction — the
 * reciprocal of the controller-owned {@link InteractionState} (in
 * `interaction-mode.ts`). Deliberately a *distinct* type: `InteractionState`
 * flows controller → view (current state, includes `idle`), while
 * `InteractionIntent` flows view → controller (a request to enter a mode, so
 * only the begin-transitions). Same `Interaction` root, opposite directions —
 * state vs. intent. The five variants are discriminated by `mode`, mirroring
 * the active `InteractionState` modes.
 */
export type InteractionIntent =
  | {
    mode: 'placing';
    element: Element;
    offset?: Point;
    /**
       * When true, the editor treats `element` as a copy *source* and clones it
       * (fresh UUIDs, pruned connectivity) before placement. The view decides
       * *that* a copy should happen (e.g. shift-click); constructing the clone
       * is the editor's concern.
       */
    copy?: boolean;
  }
  | { mode: 'placingLabel'; element: Element; offset?: Point }
  | { mode: 'resizingBR'; element: Element }
  | { mode: 'resizingTL'; element: Element }
  | ({ mode: 'connecting' } & StartConnectDetail);

export type StartInteractionEvent = CustomEvent<InteractionIntent>;

export function newStartInteractionEvent(
  detail: InteractionIntent,
): StartInteractionEvent {
  return new CustomEvent('oscd-sld-start-interaction', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type SelectDetail = { element: Element };

export type SelectEvent = CustomEvent<SelectDetail>;

export function newSelectEvent(element: Element): SelectEvent {
  return new CustomEvent<SelectDetail>('oscd-sld-selected', {
    bubbles: true,
    composed: true,
    detail: { element },
  });
}

export type EditSclDetail = { element: Element };

export type EditSclEvent = CustomEvent<EditSclDetail>;

export function newSclEditDialogEvent(element: Element): EditSclEvent {
  return new CustomEvent<EditSclDetail>('oscd-sld-edit-scl', {
    bubbles: true,
    composed: true,
    detail: { element },
  });
}

export type GroundTerminalDetail = {
  equipment: Element;
  terminal: 'T1' | 'T2' | 'N1' | 'N2';
};

export type GroundTerminalEvent = CustomEvent<GroundTerminalDetail>;

export function newGroundTerminalEvent(
  equipment: Element,
  terminal: 'T1' | 'T2' | 'N1' | 'N2',
): GroundTerminalEvent {
  return new CustomEvent('oscd-sld-ground-terminal', {
    bubbles: true,
    composed: true,
    detail: { equipment, terminal },
  });
}

export type OpenContextMenuDetail = {
  element: Element;
  x: number;
  y: number;
  gridX: number;
  gridY: number;
};

export type OpenContextMenuEvent = CustomEvent<OpenContextMenuDetail>;

export function newOpenContextMenuEvent(
  detail: OpenContextMenuDetail,
): OpenContextMenuEvent {
  return new CustomEvent('oscd-sld-open-context-menu', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type EditIedDetail = { element: Element };

export type EditIedEvent = CustomEvent<EditIedDetail>;

export function newEditIedEvent(element: Element): EditIedEvent {
  return new CustomEvent<EditIedDetail>('oscd-sld-edit-ied', {
    bubbles: true,
    composed: true,
    detail: { element },
  });
}

/**
 * Substation-chrome commands requested from the header affordances. Each
 * carries the substation it targets, so the editor can act without relying on a
 * render-time closure. `resize` opens the resize *dialog* — distinct from the
 * gesture-completion `oscd-sld-resize`, which commits a drag.
 */
export type SubstationCommandEvent = CustomEvent<Element>;

export function newSubstationResizeEvent(
  substation: Element,
): SubstationCommandEvent {
  return new CustomEvent('oscd-sld-substation-resize', {
    bubbles: true,
    composed: true,
    detail: substation,
  });
}

export function newSubstationDeleteEvent(
  substation: Element,
): SubstationCommandEvent {
  return new CustomEvent('oscd-sld-substation-delete', {
    bubbles: true,
    composed: true,
    detail: substation,
  });
}

export function newSubstationExportEvent(
  substation: Element,
): SubstationCommandEvent {
  return new CustomEvent('oscd-sld-substation-export', {
    bubbles: true,
    composed: true,
    detail: substation,
  });
}

export type GroundHintEvent = CustomEvent<undefined>;

export function newGroundHintEvent(): GroundHintEvent {
  return new CustomEvent('oscd-sld-ground-hint', {
    bubbles: true,
    composed: true,
  });
}

/** Detail: the section whose routing warning the user dismissed. */
export type DismissRoutingWarningEvent = CustomEvent<Element>;

export function newDismissRoutingWarningEvent(
  section: Element,
): DismissRoutingWarningEvent {
  return new CustomEvent('oscd-sld-dismiss-routing-warning', {
    bubbles: true,
    composed: true,
    detail: section,
  });
}

export type InActionEvent = CustomEvent<boolean>;

export function newInActionEvent(active: boolean): InActionEvent {
  return new CustomEvent('oscd-sld-in-action', {
    bubbles: true,
    composed: true,
    detail: active,
  });
}

declare global {
  interface ElementEventMap {
    ['oscd-sld-resize']: ResizeEvent;
    ['oscd-sld-resize-tl']: ResizeTLEvent;
    ['oscd-sld-place']: PlaceEvent;
    ['oscd-sld-place-label']: PlaceLabelEvent;
    ['oscd-sld-connect']: ConnectEvent;
    ['oscd-sld-extend-connect-point']: ExtendConnectPointEvent;
    ['oscd-sld-rotate']: StartEvent;
    ['oscd-sld-start-interaction']: StartInteractionEvent;
    ['oscd-sld-selected']: SelectEvent;
    ['oscd-sld-edit-scl']: EditSclEvent;
    ['oscd-sld-edit-ied']: EditIedEvent;
    ['oscd-sld-ground-terminal']: GroundTerminalEvent;
    ['oscd-sld-open-context-menu']: OpenContextMenuEvent;
    ['oscd-sld-substation-resize']: SubstationCommandEvent;
    ['oscd-sld-substation-delete']: SubstationCommandEvent;
    ['oscd-sld-substation-export']: SubstationCommandEvent;
    ['oscd-sld-ground-hint']: GroundHintEvent;
    ['oscd-sld-in-action']: InActionEvent;
    ['oscd-sld-dismiss-routing-warning']: DismissRoutingWarningEvent;
  }
}
