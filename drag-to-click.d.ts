import type { ReactiveController, ReactiveControllerHost } from 'lit';
export interface DragToClickOptions {
    /** Whether a press may begin a drag; true only for presses that start a click-move-click gesture. */
    canStart: (event: MouseEvent) => boolean;
    /** Whether the click that began the drag actually started a gesture. */
    isActive: () => boolean;
    /** Replaces the click replayed on the pressed element when the drag begins. */
    begin?: (press: MouseEvent) => void;
    /** Runs once a drag that began has ended, however it ended. */
    finish?: () => void;
}
/** True when `path` runs through a substation canvas, where drops are accepted. */
export declare function isInSldCanvas(path: EventTarget[]): boolean;
/**
 * Lets press-drag-release stand in for click-move-click by replaying the two
 * clicks the gesture needs: the first once the mouse has moved past a small
 * threshold (on the pressed element), the second on release (on whatever is
 * under the cursor). Existing click handlers do all the work, so a plain click
 * and click-move-click keep working unchanged.
 *
 * Mouse events only: touch emits none while scrolling or panning, so the
 * browser keeps those gestures.
 */
export declare class DragToClickController implements ReactiveController {
    private host;
    private options;
    private press?;
    constructor(host: ReactiveControllerHost & HTMLElement, options: DragToClickOptions);
    hostConnected(): void;
    hostDisconnected(): void;
    private onDown;
    private onMove;
    private onUp;
    private preventSelection;
    private end;
}
