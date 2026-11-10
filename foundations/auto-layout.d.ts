/**
 * A first single line diagram for a substation that has none yet.
 *
 * Voltage levels are stacked one below the other. In each, bays that only
 * hold a connectivity node become bus bars across its top, and the other bays
 * are lined up below them. Within a bay, equipment connected to each other is
 * placed close together: each row holds what is one connection further away
 * from where the bay is fed, with one free cell around every item.
 * Transformers outside of bays go to the right of their voltage level or of
 * the whole substation. Connections are then drawn one by one, the shortest
 * first, each joining the wires of its connectivity node drawn so far.
 */
import type { EditV2 } from '@openscd/oscd-api';
/** Whether none of the containers and equipment of `substation` has been placed yet. */
export declare function needsLayout(substation: Element): boolean;
/**
 * Edits that give every voltage level, bay, piece of equipment and
 * transformer of `substation` a place, and draw all of its connections.
 */
export declare function autoLayoutEdits(substation: Element, nsp: string): EditV2[];
