/**
 * Splitting and joining connectivity nodes along their wires.
 *
 * Taking a wire out of a connectivity node can leave its other wires in
 * several pieces. Each piece that still connects two or more terminals becomes
 * a connectivity node of its own; a piece that connects fewer is removed along
 * with its terminal. Drawing a new wire from one connectivity node to another
 * joins the two into one.
 */
import type { EditV2 } from '@openscd/oscd-api';
import type { ConnectDetail } from './events.js';
import type { Point } from './geometry.js';
/** The terminals and neutral points the ends of `section` are attached to. */
export declare function sectionTerminals(section: Element): Element[];
/**
 * Edits that take the wire `section` out of its connectivity node, along with
 * the terminals at its ends, and split what is left of the node where the
 * wire held it together.
 */
export declare function disconnectSectionEdits(section: Element): EditV2[];
/**
 * Edits that draw a new wire along `path` from the wire `from` (a Section) to
 * a terminal of `to`, or to another connectivity node `to`, which is then
 * joined with the one `from` belongs to.
 */
export declare function wireConnectEdits({ from, path, to, toTerminal }: ConnectDetail, doc: XMLDocument, nsp: string): EditV2[];
/**
 * The point on the wire `section` nearest to `near` where a new wire can join
 * it: on the half grid, and not where it is attached to a terminal.
 */
export declare function joinPoint(section: Element, near: Point): Point | undefined;
