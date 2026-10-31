import { html, svg } from 'lit';
import { OscdIcon } from '@omicronenergy/oscd-ui/icon/OscdIcon.js';
import { eqTypes, ringedEqTypes, singleTerminal } from './foundations/equipment.js';
import { equipmentPath, eqRingPath, zigZag2WTransform, zigZagPath, } from './drawing/diagram-symbols.js';
// ─── Action icons (viewBox 0 96 960 960) ───
const sld_move = svg `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960" fill="currentColor"><path d="M480 976 310 806l57-57 73 73V616l-205-1 73 73-58 58L80 576l169-169 57 57-72 72h206V330l-73 73-57-57 170-170 170 170-57 57-73-73v206l205 1-73-73 58-58 170 170-170 170-57-57 73-73H520l-1 205 73-73 58 58-170 170Z"/></svg>`;
const sld_resize = svg `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960" fill="currentColor"><path d="M120 616v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm160 0v-80h80v80h-80Zm160 640v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80v80h-80Zm160 0v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160V296H600v-80h240v240h-80ZM120 936V696h80v160h160v80H120Z"/></svg>`;
const sld_resizeTL = svg `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960" fill="currentColor"><path d="m 120,616 v -80 h 80 v 80 z m 0,-160 v -80 h 80 v 80 z m 0,-160 v -80 h 80 v 80 z m 160,0 v -80 h 80 v 80 z m 160,0 v -80 h 80 v 80 z m 320,0 H 600 V 216 H 840 Z M 120,936 V 696 h 80 v 160 z"/></svg>`;
const sld_resizeBR = svg `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 96 960 960" fill="currentColor"><path d="m 440,936 v -80 h 80 v 80 z m 160,0 v -80 h 80 v 80 z m 160,0 v -80 h 80 v 80 z m 0,-160 v -80 h 80 v 80 z m 0,-160 v -80 h 80 v 80 z m 0,-160 V 296 l 80,-80 v 240 z m -640,480 80,-80 h 160 v 80 z"/></svg>`;
const voltageLevelPath = svg `<path
  d="M 4 4 L 12.5 21 L 21 4"
  fill="none"
  stroke="currentColor"
  stroke-width="3"
  stroke-linejoin="round"
  stroke-linecap="round"
/>`;
const bayPath = svg `<path
    d="M 3 2 L 22 2"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 3 5 L 22 5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 7 2 L 7 7.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 18 5 L 18 7.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 5.5 8.5 L 7 11 L 7 13 L 18 13 L 18 11 L 16.5 8.5"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 12.5 13 L 12.5 15"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 11 16 L 12.5 18.5 L 12.5 23"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />
  <path
    d="M 10.5 21 L 12.5 23 L 14.5 21"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linejoin="round"
    stroke-linecap="round"
  />`;
const ptr1WAPath = svg `
  <circle fill="none" cx="1.5" cy="1.5" r="0.7"/>
  <path fill="none" d="M 1.5 0.8 C 0.5 0.8, 0.4 1.3, 0.3 1.5"/>
`;
const ptr2WAPath = svg `
  <circle fill="none" cx="1.5" cy="1.5" r="0.7"/>
  <path fill="none" d="M 1.5 0.8 C 0.5 0.8, 0.4 1.3, 0.3 1.5"/>
  <circle fill="none" cx="1.5" cy="2.5" r="0.7"/>
`;
const ptr1WPath = svg `
  <circle fill="none" cx="1.5" cy="1.5" r="0.7"/>
`;
const ptr2WPath = svg `
  <circle fill="none" cx="1.5" cy="1.5" r="0.7"/>
  <circle fill="none" cx="1.5" cy="2.5" r="0.7"/>
`;
const ptr3WPath = svg `
  <circle fill="none" cx="1.5" cy="1.5" r="0.7"/>
  <circle fill="none" cx="2" cy="2.5" r="0.7"/>
  <circle fill="none" cx="1" cy="2.5" r="0.7"/>
`;
function equipmentIcon(equipmentType) {
    return svg `<svg viewBox="0 0 25 25" width="24" height="24">
    <line
      x1="12.5"
      y1="0"
      x2="12.5"
      y2="4"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    ${!equipmentType || !singleTerminal.has(equipmentType)
        ? svg `<line
      x1="12.5"
      y1="21"
      x2="12.5"
      y2="25"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />`
        : ''}
    ${equipmentPath(equipmentType)}
    ${equipmentType && ringedEqTypes.has(equipmentType) ? eqRingPath : ''}
  </svg>`;
}
function ptrIcon(windings, kind = 'default') {
    let path = svg ``;
    if (windings === 3) {
        path = ptr3WPath;
    }
    else if (windings === 2) {
        path = kind === 'auto' ? ptr2WAPath : ptr2WPath;
    }
    else if (windings === 1) {
        path = kind === 'auto' ? ptr1WAPath : ptr1WPath;
    }
    const zigZag = kind === 'earthing'
        ? svg `<g transform="${windings > 1 ? zigZag2WTransform : ''}">${zigZagPath}</g>`
        : '';
    return svg `<svg
    viewBox="0.3 0.5 2.4 ${windings > 1 ? 3 : 2}"
    width="24"
    height="24"
    stroke="currentColor"
    stroke-width="${windings > 1 ? 0.14 : 0.11}"
    stroke-linecap="round"
  >
    ${path} ${zigZag}
  </svg>`;
}
/**
 * SLD-specific icon registry.
 *
 * Lookup order: SLD_ICONS → SCL_ICONS (via OscdIcon) → Material Symbols.
 * When the icon consolidation discussion concludes, these entries can be
 * merged into SCL_ICONS and this component replaced with plain OscdIcon.
 */
export const SLD_ICONS = {
    sld_move,
    sld_resize,
    sld_resizeTL,
    sld_resizeBR,
    sld_bay: svg `<svg viewBox="0 0 25 25" width="24" height="24">${bayPath}</svg>`,
    sld_voltage_level: svg `<svg viewBox="0 0 25 25" width="24" height="24">${voltageLevelPath}</svg>`,
    sld_ptr_1: ptrIcon(1),
    sld_ptr_1_auto: ptrIcon(1, 'auto'),
    sld_ptr_1_earthing: ptrIcon(1, 'earthing'),
    sld_ptr_2: ptrIcon(2),
    sld_ptr_2_auto: ptrIcon(2, 'auto'),
    sld_ptr_2_earthing: ptrIcon(2, 'earthing'),
    sld_ptr_3: ptrIcon(3),
    sld_conducting_equipment: equipmentIcon(null),
    ...Object.fromEntries(eqTypes.map(eqType => [`sld_equipment_${eqType}`, equipmentIcon(eqType)])),
};
/**
 * Icon component for the SLD editor.
 *
 * Checks {@link SLD_ICONS} first, then falls back to `OscdIcon` which
 * handles SCL_ICONS → Material Symbols.
 *
 * Usage is identical to `<oscd-icon>`:
 * ```html
 * <oscd-sld-icon>sld_move</oscd-sld-icon>   <!-- SLD icon -->
 * <oscd-sld-icon>gooseIcon</oscd-sld-icon>   <!-- SCL icon (fallback) -->
 * <oscd-sld-icon>edit</oscd-sld-icon>        <!-- Material (fallback) -->
 * ```
 */
export class OscdSldIcon extends OscdIcon {
    constructor() {
        super(...arguments);
        this._sldName = '';
    }
    connectedCallback() {
        super.connectedCallback();
        this._updateSldName();
        this._sldObserver = new MutationObserver(() => {
            this._updateSldName();
        });
        this._sldObserver.observe(this, {
            characterData: true,
            subtree: true,
            childList: true,
        });
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._sldObserver?.disconnect();
        this._sldObserver = undefined;
    }
    _updateSldName() {
        const name = (this.textContent ?? '').trim();
        if (name !== this._sldName) {
            this._sldName = name;
            this.requestUpdate();
        }
    }
    render() {
        const sldSvg = SLD_ICONS[this._sldName];
        if (sldSvg) {
            return html `${sldSvg}`;
        }
        return super.render();
    }
}
//# sourceMappingURL=oscd-sld-icon.js.map