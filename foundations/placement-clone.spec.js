import { expect } from '@open-wc/testing';
import { copyElementForPlacement } from './placement-clone.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';
describe('placement-clone', () => {
    describe('copyElementForPlacement', () => {
        it('returns a deep clone of the element', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="10" smth:h="10"/>
            </Private>
            <Bay name="B1">
              <Private type="OpenSCD-SLD-Layout">
                <smth:SLDAttributes smth:x="2" smth:y="2" smth:w="5" smth:h="5"/>
              </Private>
              <ConductingEquipment name="Q1" type="CBR">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
                </Private>
              </ConductingEquipment>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const clone = copyElementForPlacement(vl, 'smth');
            expect(clone.tagName).to.equal('VoltageLevel');
            expect(clone.getAttribute('name')).to.equal('V1');
            expect(clone.querySelector('Bay')).to.not.be.null;
            expect(clone).to.not.equal(vl);
        });
        it('removes IED references from Bay/VoltageLevel clones', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="10" smth:h="10"/>
              <smth:Reference smth:type="IED" smth:id="IED1">
                <smth:SLDAttributes smth:x="2" smth:y="2" smth:w="1" smth:h="1"/>
              </smth:Reference>
            </Private>
          </VoltageLevel>
        </Substation>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const clone = copyElementForPlacement(vl, 'smth');
            const refs = clone.getElementsByTagNameNS(sldNs, 'Reference');
            expect(refs).to.have.length(0);
        });
    });
});
//# sourceMappingURL=placement-clone.spec.js.map