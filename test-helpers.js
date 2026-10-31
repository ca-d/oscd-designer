import { sclNs, sldNs } from './foundations.js';
/**
 * Injects unnamespaced decoy attributes into a parsed SCL document.
 *
 * Every namespaced SLD attribute (e.g. `smth:x="3"`) gets an unnamespaced twin
 * (`x="DECOY"`). Code that uses `getAttribute('x')` will get `"DECOY"`; code
 * that correctly uses `getAttributeNS(sldNs, 'x')` gets the real value.
 *
 * This catches the realistic fragility of hand-edited SCL files or buggy
 * serializers leaving unnamespaced attributes alongside namespaced ones.
 */
function injectAttributeDecoys(doc) {
    const sldElements = [
        ...Array.from(doc.getElementsByTagNameNS(sldNs, 'Section')),
        ...Array.from(doc.getElementsByTagNameNS(sldNs, 'Vertex')),
        ...Array.from(doc.getElementsByTagNameNS(sldNs, 'SLDAttributes')),
    ];
    for (const el of sldElements) {
        for (const attr of Array.from(el.attributes)) {
            if (attr.namespaceURI === sldNs) {
                el.setAttribute(attr.localName, 'DECOY');
            }
        }
    }
}
/** Creates an SCL XMLDocument with attribute decoys injected. */
export function createSCLDoc(inner) {
    const doc = new DOMParser().parseFromString(`<?xml version="1.0" encoding="UTF-8"?>
    <SCL xmlns="${sclNs}" xmlns:smth="${sldNs}" version="2007" revision="B">
      ${inner}
    </SCL>`, 'application/xml');
    injectAttributeDecoys(doc);
    return doc;
}
/**
 * Builds the standard artifact-spec scaffold: a laid-out
 * `Substation S1 > VoltageLevel V1 > Bay`, into which the caller injects the
 * leaf SCL (`children`) the artifact under test cares about.
 *
 * Defaults place the voltage level at `(1,1)` 20×20 and a `Bay` named `B1` at
 * `(2,2)` 10×10. Override `vl`/`bay` only for the coordinates a spec asserts
 * on (e.g. busbar specs use a `BB1` bay). The outer substation is 50×25.
 */
export function sldFixture({ vl = {}, bay = {}, bayName = 'B1', children = '', } = {}) {
    const { x: vlX = 1, y: vlY = 1, w: vlW = 20, h: vlH = 20 } = vl;
    const { x: bayX = 2, y: bayY = 2, w: bayW = 10, h: bayH = 10 } = bay;
    return createSCLDoc(`
    <Substation name="S1">
      <Private type="OpenSCD-SLD-Layout">
        <smth:SLDAttributes smth:w="50" smth:h="25"/>
      </Private>
      <VoltageLevel name="V1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="${vlX}" smth:y="${vlY}" smth:w="${vlW}" smth:h="${vlH}"/>
        </Private>
        <Bay name="${bayName}">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="${bayX}" smth:y="${bayY}" smth:w="${bayW}" smth:h="${bayH}"/>
          </Private>
          ${children}
        </Bay>
      </VoltageLevel>
    </Substation>
  `);
}
/**
 * Shared test utilities for computing viewport positions from SVG grid
 * coordinates. These helpers dynamically resolve pixel positions based on
 * the SVG element's bounding rect and viewBox, eliminating cross-browser
 * failures caused by hardcoded pixel offsets.
 */
/**
 * Return the `#sld` SVG element from a SldSubstationViewer shadow root.
 */
export function findSubstationSvgRoot(substationEditor) {
    const svg = substationEditor.shadowRoot.querySelector('svg#sld');
    if (!svg) {
        throw new Error('Could not find svg#sld in SldSubstationViewer');
    }
    return svg;
}
/**
 * Convert a grid cell position to browser viewport pixel coordinates.
 * Targets the center of the cell so that `Math.floor(svgX)` yields
 * the correct integer grid position.
 */
export function gridPosToViewportCoords(svg, gx, gy) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return [
        Math.floor(rect.left + ((gx + 0.5 - vb.x) / vb.width) * rect.width),
        Math.floor(rect.top + ((gy + 0.5 - vb.y) / vb.height) * rect.height),
    ];
}
/**
 * Convert SCL label storage coordinates (lx, ly) to browser viewport
 * pixel coordinates. Inverts the component's label storage formula:
 *   lx = mouseX2 - 0.5,  ly = mouseY2 + 0.5
 * to determine where to click so the label ends up at (lx, ly).
 */
export function sclLabelToViewportCoords(svg, lx, ly) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const svgX = lx + 0.5;
    const svgY = ly - 0.5;
    return [
        Math.round(rect.left + ((svgX - vb.x) / vb.width) * rect.width),
        Math.round(rect.top + ((svgY - vb.y) / vb.height) * rect.height),
    ];
}
/**
 * Convert exact SVG coordinates to browser viewport pixel coordinates.
 * Use when half-grid precision (mouseX2/mouseY2) matters, e.g. for
 * connection vertex placement.
 */
export function svgToViewportCoords(svg, svgX, svgY) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    return [
        Math.round(rect.left + ((svgX - vb.x) / vb.width) * rect.width),
        Math.round(rect.top + ((svgY - vb.y) / vb.height) * rect.height),
    ];
}
// ─── Frequently used grid coordinate pairs ───────────────────────────────────
/** Position of the VoltageLevel in voltageLevelDocString (x=1, y=1) */
export const vlOrigin = [1, 1];
/** Bottom-right resize target for VL from vlOrigin to w=8, h=7 */
export const vlResizeBR = [8, 7];
/** Standard top-left corner for placing new elements (VL, bay, bus bar) */
export const placeTL = [5, 3];
/** Standard bottom-right resize corner from placeTL giving w=7, h=8 */
export const placeBR = [11, 10];
/** Equipment position in equipmentDocString (x=4, y=4) */
export const eqPos = [4, 4];
/** Common target for equipment move/copy (x=3, y=3) */
export const eqTarget = [3, 3];
//# sourceMappingURL=test-helpers.js.map