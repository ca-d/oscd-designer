/**
 * SLD placement and resize validation rules.
 *
 * These encode the domain-specific logic for whether an SCL element can
 * legally occupy a given position or size on the SLD grid. They know about
 * the SLD topology (parent/child containment hierarchy, bus bar exemptions,
 * IED references occupying grid space, etc.).
 */
import { contains } from './geometry.js';
import { containsRect, overlapsRect } from './element-geometry.js';
import { isBusBar } from './connectivity.js';
import { attributes, getSLDAttributes } from './sld-attributes.js';
import { iedReferences, isIedReferenceElement } from './ied.js';
const parentTags = {
    ConductingEquipment: ['Bay'],
    Bay: ['VoltageLevel'],
    VoltageLevel: ['Substation'],
    PowerTransformer: ['Bay', 'VoltageLevel', 'Substation'],
    Reference: ['Bay', 'VoltageLevel', 'Substation'],
};
/** A VoltageLevel or Bay that has not been sized yet, so it can be dragged out. */
export function isUnsizedContainer(element) {
    return (['Bay', 'VoltageLevel'].includes(element.tagName) &&
        !isBusBar(element) &&
        (!getSLDAttributes(element, 'w') || !getSLDAttributes(element, 'h')));
}
/** A new bus bar that has not been sized yet, so it can be dragged out. */
export function isUnsizedBusBar(element) {
    return isBusBar(element) && !getSLDAttributes(element, 'h');
}
export function canPlaceAt(root, element, x, y, w, h) {
    if (element.tagName === 'Substation') {
        return true;
    }
    const overlappingSibling = Array.from(root.querySelectorAll(`${element.localName}, PowerTransformer`))
        .concat(iedReferences(root))
        .find(sibling => sibling.closest(element.localName) !== element &&
        overlapsRect(sibling, x, y, w, h) &&
        !isBusBar(sibling));
    if (overlappingSibling && !isBusBar(element)) {
        return false;
    }
    const containingParent = element.tagName === 'VoltageLevel' ||
        element.tagName === 'PowerTransformer' ||
        isIedReferenceElement(element)
        ? containsRect(root, x, y, w, h)
        : Array.from(root.querySelectorAll(parentTags[element.localName].join(','))).find(parent => !isBusBar(parent) && containsRect(parent, x, y, w, h));
    if (containingParent) {
        return true;
    }
    return false;
}
export function canResizeTo(root, element, w, h) {
    const { pos: [x, y], dim: [oldW, oldH], } = attributes(element);
    if (!canPlaceAt(root, element, x, y, w, h) &&
        canPlaceAt(root, element, x, y, oldW, oldH)) {
        return false;
    }
    const lostChild = Array.from(element.children)
        .concat(iedReferences(element))
        .find((child) => {
        if (!parentTags[child.localName]?.includes(element.localName)) {
            return false;
        }
        const { pos: [cx, cy], dim: [cw, ch], } = attributes(child);
        return !contains([x, y, w, h], [cx, cy, cw, ch]);
    });
    if (lostChild) {
        return false;
    }
    return true;
}
export function canResizeToTL(root, element, x, y, w, h) {
    if (!canPlaceAt(root, element, x, y, w, h)) {
        return false;
    }
    const lostChild = Array.from(element.children)
        .concat(iedReferences(element))
        .find((child) => {
        if (!parentTags[child.localName]?.includes(element.localName)) {
            return false;
        }
        const { pos: [cx, cy], dim: [cw, ch], } = attributes(child);
        return !contains([x, y, w, h], [cx, cy, cw, ch]);
    });
    if (lostChild) {
        return false;
    }
    return true;
}
//# sourceMappingURL=sld-placement.js.map