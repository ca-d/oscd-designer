import { privType, sldNs } from '../foundations.js';
/** Creates the edit that removes an SLD IED reference and its empty layout container. */
export function createRemoveIedReferenceEdit(referencedIed) {
    const sldLayoutPrivate = referencedIed.parentElement;
    const sldChildren = sldLayoutPrivate
        ? Array.from(sldLayoutPrivate.children).filter(child => child.namespaceURI === sldNs)
        : [];
    if (sldLayoutPrivate?.tagName === 'Private' &&
        sldLayoutPrivate.getAttribute('type') === privType &&
        sldChildren.length === 1) {
        return { node: sldLayoutPrivate };
    }
    return { node: referencedIed };
}
//# sourceMappingURL=ied-edits.js.map