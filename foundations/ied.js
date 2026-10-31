import { identity } from '@openscd/scl-lib';
import { sldNs } from '../foundations.js';
export function isIedReferenceElement(element) {
    return (element.localName === 'Reference' &&
        element.namespaceURI === sldNs &&
        element.getAttributeNS(sldNs, 'type') === 'IED');
}
export function iedReferences(root) {
    const refs = Array.from(root.getElementsByTagNameNS(sldNs, 'Reference')).filter(isIedReferenceElement);
    return refs;
}
/** Returns SLD IED references whose target IED no longer exists. */
export function unresolvedIedReferences(root) {
    return iedReferences(root).filter(reference => !resolveIed(reference));
}
function iedIdentity(referencedIed) {
    if (isIedReferenceElement(referencedIed)) {
        return referencedIed.getAttributeNS(sldNs, 'id');
    }
    return null;
}
export function resolveIed(referencedIed) {
    const doc = referencedIed.ownerDocument;
    if (isIedReferenceElement(referencedIed)) {
        const referenceIdentity = iedIdentity(referencedIed);
        if (!referenceIdentity) {
            return null;
        }
        return (Array.from(doc.querySelectorAll(':root > IED')).find(ied => identity(ied) === referenceIdentity) ?? null);
    }
    return null;
}
//# sourceMappingURL=ied.js.map