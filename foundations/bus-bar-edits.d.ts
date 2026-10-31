/**
 * Resizing a bus bar without disconnecting what is attached to it.
 *
 * A bus bar is a run of thick sections along a straight line, cut wherever a
 * feeder joins. Where the bus bar no longer reaches a feeder, the part of the
 * line in between becomes thin wire instead, so the feeder stays connected; and
 * where the bus bar grows over such wire again, that wire becomes thick again.
 */
import type { EditV2 } from '@openscd/oscd-api';
/**
 * Edits that resize the bus bar of `element` so that it ends at `(x, y)`,
 * keeping every feeder connected.
 */
export declare function busBarVertexEdits(element: Element, x: number, y: number, nsp: string): EditV2[];
