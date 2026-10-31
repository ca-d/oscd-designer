import { expect } from '@open-wc/testing';
import { createRemoveIedReferenceEdit } from './ied-edits.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';
describe('ied-edits', () => {
    describe('createRemoveIedReferenceEdit', () => {
        it('removes the parent Private if it contains only the reference', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const edit = createRemoveIedReferenceEdit(ref);
            expect(edit.node.tagName).to.equal('Private');
        });
        it('removes only the reference if Private has other children', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
            <smth:SLDAttributes smth:w="50"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const edit = createRemoveIedReferenceEdit(ref);
            expect(edit.node.localName).to.equal('Reference');
        });
        it('removes only the reference if parent is not a layout Private', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="Other">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const edit = createRemoveIedReferenceEdit(ref);
            expect(edit.node.localName).to.equal('Reference');
        });
    });
});
//# sourceMappingURL=ied-edits.spec.js.map