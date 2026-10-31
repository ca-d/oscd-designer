import { expect } from '@open-wc/testing';
import { canPlaceAt, canResizeTo, canResizeToTL, isUnsizedContainer, } from './sld-placement.js';
import { createSCLDoc } from '../test-helpers.js';
const standardLayout = `
  <Substation name="S1">
    <Private type="OpenSCD-SLD-Layout">
      <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
    </Private>
    <VoltageLevel name="V1">
      <Private type="OpenSCD-SLD-Layout">
        <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="20" smth:h="15"/>
      </Private>
      <Bay name="B1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="2" smth:y="2" smth:w="8" smth:h="10"/>
        </Private>
      </Bay>
    </VoltageLevel>
  </Substation>
`;
describe('sld-placement', () => {
    describe('isUnsizedContainer', () => {
        it('is true for a bay or voltage level without a size', () => {
            const doc = createSCLDoc('<Substation name="S1"/>');
            expect(isUnsizedContainer(doc.createElement('Bay'))).to.be.true;
            expect(isUnsizedContainer(doc.createElement('VoltageLevel'))).to.be.true;
        });
        it('is false once the container has a size', () => {
            const doc = createSCLDoc(standardLayout);
            expect(isUnsizedContainer(doc.querySelector('Bay'))).to.be.false;
            expect(isUnsizedContainer(doc.querySelector('VoltageLevel'))).to.be.false;
        });
        it('is false for other elements', () => {
            const doc = createSCLDoc(standardLayout);
            expect(isUnsizedContainer(doc.querySelector('Substation'))).to.be.false;
            expect(isUnsizedContainer(doc.createElement('ConductingEquipment'))).to.be
                .false;
        });
    });
    describe('canPlaceAt', () => {
        it('always returns true for Substation elements', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            expect(canPlaceAt(doc.documentElement, sub, 99, 99, 1, 1)).to.be.true;
        });
        it('returns true when VoltageLevel fits inside Substation', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canPlaceAt(sub, vl, 5, 5, 10, 10)).to.be.true;
        });
        it('returns false when VoltageLevel is outside Substation', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canPlaceAt(sub, vl, 100, 100, 10, 10)).to.be.false;
        });
        it('returns true when Bay fits inside VoltageLevel', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const bay = doc.querySelector('Bay');
            expect(canPlaceAt(sub, bay, 3, 3, 4, 5)).to.be.true;
        });
        it('returns false when Bay is outside VoltageLevel', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const bay = doc.querySelector('Bay');
            expect(canPlaceAt(sub, bay, 30, 30, 4, 5)).to.be.false;
        });
        it('returns false when overlapping with sibling', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
          </Private>
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="20" smth:h="15"/>
            </Private>
          </VoltageLevel>
          <VoltageLevel name="V2">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="10" smth:h="10"/>
            </Private>
          </VoltageLevel>
        </Substation>
      `);
            const sub = doc.querySelector('Substation');
            const vl1 = doc.querySelectorAll('VoltageLevel')[0];
            expect(canPlaceAt(sub, vl1, 5, 5, 10, 10)).to.be.false;
        });
    });
    describe('canResizeTo', () => {
        it('returns true when resize keeps children contained', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeTo(sub, vl, 25, 20)).to.be.true;
        });
        it('returns false when resize would lose a child', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeTo(sub, vl, 3, 3)).to.be.false;
        });
        it('returns true for shrink that still contains children', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="50"/>
          </Private>
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="40" smth:h="40"/>
            </Private>
            <Bay name="B1">
              <Private type="OpenSCD-SLD-Layout">
                <smth:SLDAttributes smth:x="2" smth:y="2" smth:w="5" smth:h="5"/>
              </Private>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeTo(sub, vl, 20, 20)).to.be.true;
        });
    });
    describe('canResizeToTL', () => {
        it('returns true when new bounds contain children and fit in parent', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeToTL(sub, vl, 1, 1, 25, 20)).to.be.true;
        });
        it('returns false when new bounds cannot be placed', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeToTL(sub, vl, 100, 100, 5, 5)).to.be.false;
        });
        it('returns false when new bounds would lose a child', () => {
            const doc = createSCLDoc(standardLayout);
            const sub = doc.querySelector('Substation');
            const vl = doc.querySelector('VoltageLevel');
            expect(canResizeToTL(sub, vl, 5, 5, 3, 3)).to.be.false;
        });
    });
});
//# sourceMappingURL=sld-placement.spec.js.map