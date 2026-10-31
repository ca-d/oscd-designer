export const eqTypes = [
    'CAB',
    'CAP',
    'CBR',
    'CTR',
    'DIS',
    'GEN',
    'IFL',
    'LIN',
    'MOT',
    'REA',
    'RES',
    'SAR',
    'SMC',
    'VTR',
];
export function isEqType(str) {
    return eqTypes.includes(str);
}
export const ringedEqTypes = new Set(['GEN', 'MOT', 'SMC']);
export const singleTerminal = new Set([
    'BAT',
    'EFN',
    'FAN',
    'GEN',
    'IFL',
    'MOT',
    'PMP',
    'RRC',
    'SAR',
    'SMC',
    'VTR',
]);
//# sourceMappingURL=equipment.js.map