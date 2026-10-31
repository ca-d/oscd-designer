import { expect } from '@open-wc/testing';
import { eqTypes, isEqType, ringedEqTypes, singleTerminal, } from './equipment.js';
describe('equipment', () => {
    describe('eqTypes', () => {
        it('contains 14 equipment type codes', () => {
            expect(eqTypes).to.have.length(14);
        });
        it('includes common types', () => {
            expect(eqTypes).to.include('CBR');
            expect(eqTypes).to.include('DIS');
            expect(eqTypes).to.include('GEN');
        });
    });
    describe('isEqType', () => {
        it('returns true for a valid equipment type', () => {
            expect(isEqType('CBR')).to.be.true;
        });
        it('returns true for all defined types', () => {
            eqTypes.forEach(t => expect(isEqType(t)).to.be.true);
        });
        it('returns false for an unknown type', () => {
            expect(isEqType('XYZ')).to.be.false;
        });
        it('returns false for empty string', () => {
            expect(isEqType('')).to.be.false;
        });
        it('returns false for lowercase variant', () => {
            expect(isEqType('cbr')).to.be.false;
        });
    });
    describe('ringedEqTypes', () => {
        it('contains GEN, MOT, SMC', () => {
            expect(ringedEqTypes.has('GEN')).to.be.true;
            expect(ringedEqTypes.has('MOT')).to.be.true;
            expect(ringedEqTypes.has('SMC')).to.be.true;
        });
        it('does not contain CBR', () => {
            expect(ringedEqTypes.has('CBR')).to.be.false;
        });
        it('has exactly 3 members', () => {
            expect(ringedEqTypes.size).to.equal(3);
        });
    });
    describe('singleTerminal', () => {
        it('contains expected single-terminal types', () => {
            expect(singleTerminal.has('GEN')).to.be.true;
            expect(singleTerminal.has('IFL')).to.be.true;
            expect(singleTerminal.has('MOT')).to.be.true;
            expect(singleTerminal.has('SAR')).to.be.true;
            expect(singleTerminal.has('VTR')).to.be.true;
        });
        it('does not contain dual-terminal types', () => {
            expect(singleTerminal.has('CBR')).to.be.false;
            expect(singleTerminal.has('DIS')).to.be.false;
            expect(singleTerminal.has('CTR')).to.be.false;
        });
        it('has 11 members', () => {
            expect(singleTerminal.size).to.equal(11);
        });
    });
});
//# sourceMappingURL=equipment.spec.js.map