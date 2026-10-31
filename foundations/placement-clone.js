/**
 * Placement-clone construction.
 *
 * Building the stand-alone preview copy for a copy-placement is an edit-model
 * concern (UUID reassignment, connectivity pruning), not a rendering one: the
 * view merely decides *that* a copy should happen (e.g. shift-click) and emits
 * a `copy` placement intent; the editor calls this to construct the clone. It
 * therefore lives outside the viewer-safe `sld-placement.ts` (which holds only
 * the read-only placement/resize validation rules).
 */
import { isBusBar } from './connectivity.js';
import { getSLDAttributes, setSLDAttributes } from './sld-attributes.js';
import { iedReferences } from './ied.js';
import { uuid } from '../foundations.js';
/**
 * Deep-clones an SCL element into a stand-alone preview copy suitable for
 * placement: it strips IED references from containers, prunes connectivity to
 * foreign elements, and assigns fresh terminal/vertex UUIDs so the clone can be
 * positioned without colliding with the source topology.
 */
export function copyElementForPlacement(element, nsp) {
    const clone = element.cloneNode(true);
    if (['Bay', 'VoltageLevel'].includes(element.tagName)) {
        iedReferences(clone).forEach(ied => ied.remove());
    }
    const terminals = new Set(Array.from(element.querySelectorAll('Terminal, NeutralPoint')));
    const cNodes = new Set(Array.from(element.querySelectorAll('ConnectivityNode')));
    terminals.forEach((terminal) => {
        const cNode = element.ownerDocument.querySelector(`ConnectivityNode[pathName="${terminal.getAttribute('connectivityNode')}"]`);
        if (cNode) {
            cNodes.add(cNode);
        }
    });
    const foreignCNodes = new Set();
    cNodes.forEach((cNode) => {
        const foreignTerminal = Array.from(element.ownerDocument.querySelectorAll(`[connectivityNode="${cNode.getAttribute('pathName')}"]`)).find(terminal => !terminals.has(terminal));
        if (foreignTerminal ||
            (isBusBar(cNode.closest('Bay')) &&
                cNode.closest(element.tagName) !== element)) {
            foreignCNodes.add(cNode);
        }
    });
    foreignCNodes.forEach((cNode) => {
        if (cNode.closest(element.tagName) === element) {
            if (isBusBar(cNode.closest('Bay'))) {
                clone
                    .querySelector(`ConnectivityNode[pathName="${cNode.getAttribute('pathName')}"]`)
                    ?.closest('Bay')
                    ?.remove();
            }
            else {
                clone
                    .querySelector(`ConnectivityNode[pathName="${cNode.getAttribute('pathName')}"]`)
                    ?.remove();
            }
        }
        terminals.forEach((terminal) => {
            if (terminal.getAttribute('connectivityNode') ===
                cNode.getAttribute('pathName')) {
                clone
                    .querySelector(`[*|uuid="${getSLDAttributes(terminal, 'uuid')}"]`)
                    ?.remove();
            }
        });
    });
    Array.from(clone.querySelectorAll('Terminal, NeutralPoint')).forEach((terminal) => {
        const oldUUID = getSLDAttributes(terminal, 'uuid');
        if (!oldUUID) {
            return;
        }
        const newUUID = uuid();
        Array.from(clone.querySelectorAll(`Vertex[*|uuid="${oldUUID}"`)).forEach(vertex => setSLDAttributes(vertex, nsp, { uuid: newUUID }));
        setSLDAttributes(terminal, nsp, { uuid: newUUID });
    });
    return clone;
}
//# sourceMappingURL=placement-clone.js.map