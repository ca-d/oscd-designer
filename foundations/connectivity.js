import { privType, sldNs } from '../foundations.js';
import { attributes, getSLDAttributes, setSLDAttributes } from './sld-attributes.js';
function sections(element) {
    const privates = element.querySelectorAll(`:scope Private[type="${privType}"]`);
    return Array.from(privates).flatMap(priv => Array.from(priv.children).filter(child => child.localName === 'Section' && child.namespaceURI === sldNs));
}
/** Returns the SLD sections in an element that are marked as busbar geometry. */
export function busSections(element) {
    return sections(element).filter(section => getSLDAttributes(section, 'bus') === 'true');
}
/** Checks whether a Bay element is represented as an SLD busbar. */
export function isBusBar(element) {
    return element.tagName === 'Bay' && busSections(element).length > 0;
}
/** Creates the template Bay structure used by the palette for new busbars. */
export function makeBusBar(doc, nsp) {
    const busBar = doc.createElementNS(doc.documentElement.namespaceURI, 'Bay');
    busBar.setAttribute('name', 'BB1');
    setSLDAttributes(busBar, nsp, { w: '2' });
    const cNode = doc.createElementNS(doc.documentElement.namespaceURI, 'ConnectivityNode');
    cNode.setAttribute('name', 'L');
    const priv = doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
    priv.setAttribute('type', privType);
    const section = doc.createElementNS(sldNs, `${nsp}:Section`);
    setSLDAttributes(section, nsp, { bus: 'true' });
    const v1 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
    setSLDAttributes(v1, nsp, { x: '0.5', y: '0.5' });
    section.appendChild(v1);
    const v2 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
    setSLDAttributes(v2, nsp, { x: '1.5', y: '0.5' });
    section.appendChild(v2);
    priv.appendChild(section);
    cNode.appendChild(priv);
    busBar.appendChild(cNode);
    return busBar;
}
/** Builds the slash-separated SCL connectivity path for an element and optional child path parts. */
export function connectivityPath(element, ...rest) {
    const pedigree = [];
    let child = element;
    while (child.parentElement && child.hasAttribute('name')) {
        pedigree.unshift(child.getAttribute('name'));
        child = child.parentElement;
    }
    return [...pedigree, ...rest].join('/');
}
/** Calculates rendered anchor points for starting T1 and T2 connections from equipment. */
export function connectionStartPoints(equipment) {
    const { pos, rot } = attributes(equipment);
    return connectionPointsAt(pos, rot);
}
/**
 * Anchor points of T1 and T2 for equipment at `pos` turned by `rot`: the
 * terminal end of a connection and the point where it meets the equipment's
 * edge.
 */
export function connectionPointsAt([x, y], rot) {
    const T1 = [
        [
            [x + 0.5, y + 0.16],
            [x + 0.84, y + 0.5],
            [x + 0.5, y + 0.84],
            [x + 0.16, y + 0.5],
        ][rot],
        [
            [x + 0.5, y],
            [x + 1, y + 0.5],
            [x + 0.5, y + 1],
            [x, y + 0.5],
        ][rot],
    ];
    const T2 = [
        [
            [x + 0.5, y + 0.84],
            [x + 0.16, y + 0.5],
            [x + 0.5, y + 0.16],
            [x + 0.84, y + 0.5],
        ][rot],
        [
            [x + 0.5, y + 1],
            [x, y + 0.5],
            [x + 0.5, y],
            [x + 1, y + 0.5],
        ][rot],
    ];
    return { T1, T2 };
}
/** Windings may not connect directly to each other; a line equipment in between models that within a Bay. */
export function canConnectToWinding(from) {
    return from.tagName !== 'TransformerWinding';
}
//# sourceMappingURL=connectivity.js.map