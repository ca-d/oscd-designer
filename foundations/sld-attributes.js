import { getReference } from '@openscd/scl-lib';
import { isIedReferenceElement } from './ied.js';
import { privType, sldNs } from '../foundations.js';
const transformerKinds = ['default', 'auto', 'earthing'];
/**
 * Fallback colour for a label with no persisted `color` SLDAttribute. This is a
 * document-data default (the value a label is treated as having when unset), not
 * a themable render token — kept a concrete literal so it round-trips through the
 * SCL unchanged. Shared with the context menu's "Reset Color" no-op check.
 */
export const DEFAULT_LABEL_COLOR = '#000';
export function isTransformerKind(kind) {
    return transformerKinds.includes(kind);
}
export function xmlBoolean(value) {
    return ['true', '1'].includes(value?.trim() ?? 'false');
}
export function sldAttributes(element, nsPrefix) {
    if (isIedReferenceElement(element)) {
        const referenceSldAttrs = Array.from(element.children).find(child => child.localName === 'SLDAttributes' && child.namespaceURI === sldNs);
        if (referenceSldAttrs) {
            return referenceSldAttrs;
        }
        if (!nsPrefix) {
            return null;
        }
        const sldAttrs = element.ownerDocument.createElementNS(sldNs, `${nsPrefix}:SLDAttributes`);
        element.appendChild(sldAttrs);
        return sldAttrs;
    }
    const priv = Array.from(element.children).find(child => child.localName === 'Private' &&
        child.getAttribute('type') === privType);
    const sldAttrs = priv
        ? Array.from(priv.children).find(child => child.localName === 'SLDAttributes' && child.namespaceURI === sldNs) ?? null
        : null;
    if (sldAttrs) {
        return sldAttrs;
    }
    if (!nsPrefix) {
        return null;
    }
    const doc = element.ownerDocument;
    const privEl = priv ?? doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
    if (!priv) {
        privEl.setAttribute('type', privType);
        element.insertBefore(privEl, getReference(element, 'Private'));
    }
    const sldAttrsNew = doc.createElementNS(sldNs, `${nsPrefix}:SLDAttributes`);
    privEl.insertBefore(sldAttrsNew, null);
    return sldAttrsNew;
}
export function setSLDAttributes(element, nsPrefix, values) {
    const isSectionOrVertex = ['Section', 'Vertex'].includes(element.localName);
    if (isSectionOrVertex) {
        Object.entries(values).forEach(([key, value]) => {
            element.setAttributeNS(sldNs, `${nsPrefix}:${key}`, value);
        });
    }
    else {
        Object.entries(values).forEach(([key, value]) => sldAttributes(element, nsPrefix)?.setAttributeNS(sldNs, `${nsPrefix}:${key}`, value));
    }
}
export function getSLDAttributes(element, key) {
    const isSectionOrVertex = ['Section', 'Vertex'].includes(element.localName);
    if (isSectionOrVertex) {
        return element.getAttributeNS(sldNs, key);
    }
    return sldAttributes(element)?.getAttributeNS(sldNs, key) ?? null;
}
export function attributes(element) {
    // Resolve the SLD-attribute source node once. `getSLDAttributes` would
    // otherwise re-run the (children-scanning) `sldAttributes` lookup for each of
    // the ~12 keys read below — a measurable cost when rendering thousands of
    // elements. Semantics match `getSLDAttributes`: Section/Vertex carry the
    // attributes directly, every other element via its SLDAttributes private.
    const isSectionOrVertex = ['Section', 'Vertex'].includes(element.localName);
    const source = isSectionOrVertex ? element : sldAttributes(element);
    const read = (key) => source?.getAttributeNS(sldNs, key) ?? null;
    const [x, y, w, h, rotVal, labelX, labelY] = [
        'x',
        'y',
        'w',
        'h',
        'rot',
        'lx',
        'ly',
    ].map(name => parseFloat(read(name) ?? '0'));
    const weight = parseInt(read('weight') ?? '300', 10);
    const pos = [x, y].map(d => Math.max(0, d));
    const dim = [w, h].map(d => Math.max(1, d));
    const label = [labelX, labelY].map(d => Math.max(0, d));
    const bus = xmlBoolean(read('bus'));
    const flip = xmlBoolean(read('flip'));
    const kindVal = read('kind');
    const kind = isTransformerKind(kindVal) ? kindVal : 'default';
    const color = read('color') || DEFAULT_LABEL_COLOR;
    const rot = (((rotVal % 4) + 4) % 4);
    return { pos, dim, label, flip, rot, bus, weight, color, kind };
}
//# sourceMappingURL=sld-attributes.js.map