import { sldNs } from '../foundations.js';
import { sldAttributes } from './sld-attributes.js';
export function updateSLDAttributes(element, nsPrefix, values) {
    const isSectionOrVertex = ['Section', 'Vertex'].includes(element.localName);
    const toBeUpdated = isSectionOrVertex
        ? element
        : sldAttributes(element, nsPrefix);
    return {
        element: toBeUpdated,
        attributesNS: {
            [sldNs]: Object.fromEntries(Object.entries(values).map(([key, value]) => [
                `${nsPrefix}:${key}`,
                value,
            ])),
        },
    };
}
//# sourceMappingURL=sld-attribute-edits.js.map