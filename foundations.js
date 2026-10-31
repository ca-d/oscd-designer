export const privType = 'OpenSCD-SLD-Layout';
export const sldNs = 'https://openscd.org/SCL/SSD/SLD/v0';
/**
 * Fallback prefix for the SLD-layout namespace ({@link sldNs}), used only when a
 * document does not already declare one. Components detect the document's actual
 * prefix at runtime (`lookupPrefix(sldNs)`) and fall back to this shared default,
 * so every component stamps the *same* prefix and view-built edits stay
 * consistent with controller-built ones.
 */
export const defaultSldNsPrefix = 'eosld';
export const xmlnsNs = 'http://www.w3.org/2000/xmlns/';
export const svgNs = 'http://www.w3.org/2000/svg';
export const xlinkNs = 'http://www.w3.org/1999/xlink';
export const sclNs = 'http://www.iec.ch/61850/2003/SCL';
/**
 * Reads the prefix a document uses for the SLD-layout namespace ({@link sldNs}),
 * falling back to {@link defaultSldNsPrefix} when the document declares none.
 *
 * `nsp` has no independent existence: it is a pure projection of the document.
 * Deriving it on demand (rather than storing and threading a copy) guarantees
 * every component stamps the *same* prefix, so view-built edits stay consistent
 * with controller-built ones. `lookupPrefix` only inspects the root element's
 * `xmlns:*` declarations, so this is O(1) in document size.
 */
export function sldPrefix(doc) {
    return doc?.documentElement.lookupPrefix(sldNs) ?? defaultSldNsPrefix;
}
/**
 * Whether `doc` already declares the SLD-layout namespace ({@link sldNs}) on its
 * root element. Unlike {@link sldPrefix} (which always returns a usable prefix,
 * falling back to {@link defaultSldNsPrefix}), this is a true predicate — use it
 * to decide whether the declaration still needs to be written. O(1) in document
 * size.
 */
export function hasSldNamespace(doc) {
    return !!doc?.documentElement.lookupPrefix(sldNs);
}
export { eqTypes, isEqType, ringedEqTypes, singleTerminal, } from './foundations/equipment.js';
export { isTransformerKind } from './foundations/sld-attributes.js';
export { attributes, getSLDAttributes, setSLDAttributes, xmlBoolean, } from './foundations/sld-attributes.js';
export { updateSLDAttributes } from './foundations/sld-attribute-edits.js';
export { busSections, connectionStartPoints, connectivityPath, isBusBar, makeBusBar, } from './foundations/connectivity.js';
export { removeNode, removeTerminal, reparentElement, uniqueName, } from './foundations/connectivity-edits.js';
export { iedReferences, isIedReferenceElement, resolveIed, } from './foundations/ied.js';
export { newConnectEvent, newPlaceEvent, newPlaceLabelEvent, newResizeEvent, newResizeTLEvent, newRotateEvent, newSelectEvent, newStartInteractionEvent, } from './foundations/events.js';
export function uuid() {
    const digits = new Array(36);
    for (let i = 0; i < 36; i += 1) {
        if ([8, 13, 18, 23].includes(i)) {
            digits[i] = '-';
        }
        else {
            digits[i] = Math.floor(Math.random() * 16);
        }
    }
    digits[14] = 4;
    digits[19] &= ~(1 << 2);
    digits[19] |= 1 << 3;
    return digits.map(x => x.toString(16)).join('');
}
//# sourceMappingURL=foundations.js.map