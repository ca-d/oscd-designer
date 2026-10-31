import { identity } from '@openscd/scl-lib';
export function isSelectable(element, selectable) {
    return selectable.some(sel => identity(element) === sel);
}
export function isToBeHighlighted(element, highlight) {
    return highlight.some(h => identity(element) === h.id);
}
export function getHighlightStyle(element, highlight) {
    const style = highlight.find(h => identity(element) === h.id)?.style;
    if (!style) {
        return '';
    }
    let styleStr = '';
    if (style?.fill) {
        styleStr += `fill: ${style.fill}; `;
    }
    if (style?.fillOpacity) {
        styleStr += `fill-opacity: ${style.fillOpacity}; `;
    }
    if (style?.stroke) {
        styleStr += `stroke: ${style.stroke}; `;
    }
    if (style?.strokeWidth) {
        styleStr += `stroke-width: ${style.strokeWidth}; `;
    }
    if (style?.strokeOpacity) {
        styleStr += `stroke-opacity: ${style.strokeOpacity}; `;
    }
    if (style?.rx) {
        styleStr += `rx: ${style.rx}; `;
    }
    return styleStr;
}
//# sourceMappingURL=highlight.js.map