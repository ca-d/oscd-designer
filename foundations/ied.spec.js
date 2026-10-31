import { expect } from '@open-wc/testing';
import { isIedReferenceElement, iedReferences, unresolvedIedReferences, resolveIed, } from './ied.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';
describe('ied', () => {
    describe('isIedReferenceElement', () => {
        it('returns true for a valid IED reference element', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            expect(isIedReferenceElement(ref)).to.be.true;
        });
        it('returns false for a non-Reference element', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const el = doc.querySelector('Substation');
            expect(isIedReferenceElement(el)).to.be.false;
        });
        it('returns false for a Reference without IED type', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="Other" smth:id="X"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            expect(isIedReferenceElement(ref)).to.be.false;
        });
    });
    describe('iedReferences', () => {
        it('returns all IED reference elements in a document', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
            <smth:Reference smth:type="IED" smth:id="IED2"/>
          </Private>
        </Substation>
      `);
            expect(iedReferences(doc)).to.have.length(2);
        });
        it('returns empty array when no references exist', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            expect(iedReferences(doc)).to.have.length(0);
        });
        it('filters out non-IED references', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
            <smth:Reference smth:type="Other" smth:id="X"/>
          </Private>
        </Substation>
      `);
            expect(iedReferences(doc)).to.have.length(1);
        });
    });
    describe('resolveIed', () => {
        it('resolves an IED reference to its IED element', () => {
            const doc = createSCLDoc(`
        <IED name="IED1"/>
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const ied = resolveIed(ref);
            expect(ied).to.not.be.null;
            expect(ied.getAttribute('name')).to.equal('IED1');
        });
        it('returns null when the IED does not exist', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="NonExistent"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            expect(resolveIed(ref)).to.be.null;
        });
        it('returns null for non-IED-reference elements', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const el = doc.querySelector('Substation');
            expect(resolveIed(el)).to.be.null;
        });
        it('returns null when reference has no id attribute', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED"/>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            expect(resolveIed(ref)).to.be.null;
        });
    });
    describe('unresolvedIedReferences', () => {
        it('returns references whose IED does not exist', () => {
            const doc = createSCLDoc(`
        <IED name="IED1"/>
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
            <smth:Reference smth:type="IED" smth:id="IED2"/>
          </Private>
        </Substation>
      `);
            const unresolved = unresolvedIedReferences(doc);
            expect(unresolved).to.have.length(1);
            expect(unresolved[0].getAttributeNS(sldNs, 'id')).to.equal('IED2');
        });
        it('returns empty array when all are resolved', () => {
            const doc = createSCLDoc(`
        <IED name="IED1"/>
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Reference smth:type="IED" smth:id="IED1"/>
          </Private>
        </Substation>
      `);
            expect(unresolvedIedReferences(doc)).to.have.length(0);
        });
    });
});
//# sourceMappingURL=ied.spec.js.map