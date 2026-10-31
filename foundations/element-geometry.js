/**
 * Element-aware geometry helpers.
 *
 * These bridge SCL Elements to the pure rectangle math in geometry.ts by
 * reading spatial attributes from elements and delegating to contains/overlaps.
 */
import { contains, overlaps } from './geometry.js';
import { attributes } from './sld-attributes.js';
export function containsRect(element, x0, y0, w0, h0) {
    const { pos: [x, y], dim: [w, h], } = attributes(element);
    return contains([x, y, w, h], [x0, y0, w0, h0]);
}
export function overlapsRect(element, x0, y0, w0, h0) {
    const { pos: [x, y], dim: [w, h], } = attributes(element);
    return overlaps([x, y, w, h], [x0, y0, w0, h0]);
}
//# sourceMappingURL=element-geometry.js.map