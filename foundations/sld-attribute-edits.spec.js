import { expect } from '@open-wc/testing';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';
function substationWithSLD(attrs) {
    const doc = createSCLDoc(`
    <Substation name="S1">
      <Private type="OpenSCD-SLD-Layout">
        <smth:SLDAttributes ${attrs}/>
      </Private>
    </Substation>
  `);
    return doc.querySelector('Substation');
}
describe('sld-attribute-edits', () => {
    describe('updateSLDAttributes', () => {
        it('returns an EditV2 update object', () => {
            const el = substationWithSLD(`smth:w="50" smth:h="25"`);
            const edit = updateSLDAttributes(el, 'smth', { w: '60' });
            expect(edit).to.have.property('element');
            expect(edit).to.have.property('attributesNS');
        });
        it('maps keys with namespace prefix', () => {
            const el = substationWithSLD(`smth:w="50"`);
            const edit = updateSLDAttributes(el, 'smth', { w: '60', h: '30' });
            const nsAttrs = edit.attributesNS[sldNs];
            expect(nsAttrs).to.have.property(`smth:w`, '60');
            expect(nsAttrs).to.have.property(`smth:h`, '30');
        });
        it('supports null values for attribute removal', () => {
            const el = substationWithSLD(`smth:w="50" smth:flip="true"`);
            const edit = updateSLDAttributes(el, 'smth', { flip: null });
            const nsAttrs = edit.attributesNS[sldNs];
            expect(nsAttrs).to.have.property(`smth:flip`, null);
        });
        it('targets the Section element directly for Section elements', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Section smth:bus="true"/>
          </Private>
        </Substation>
      `);
            const section = doc.getElementsByTagNameNS(sldNs, 'Section')[0];
            const edit = updateSLDAttributes(section, 'smth', { bus: 'false' });
            expect(edit.element).to.equal(section);
        });
    });
});
//# sourceMappingURL=sld-attribute-edits.spec.js.map