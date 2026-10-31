import { expect } from '@open-wc/testing';
import { containsRect, overlapsRect } from './element-geometry.js';
import { createSCLDoc } from '../test-helpers.js';
function createElementWithSLD(tag, attrs) {
    const doc = createSCLDoc(`
    <${tag} name="E1">
      <Private type="OpenSCD-SLD-Layout">
        <smth:SLDAttributes smth:x="${attrs.x}" smth:y="${attrs.y}" smth:w="${attrs.w}" smth:h="${attrs.h}"/>
      </Private>
    </${tag}>
  `);
    return doc.querySelector(tag);
}
describe('element-geometry', () => {
    describe('containsRect', () => {
        it('returns true when element fully contains the rectangle', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 10, h: 10 });
            expect(containsRect(el, 1, 1, 5, 5)).to.be.true;
        });
        it('returns true when rectangle matches element bounds exactly', () => {
            const el = createElementWithSLD('Substation', { x: 2, y: 3, w: 8, h: 6 });
            expect(containsRect(el, 2, 3, 8, 6)).to.be.true;
        });
        it('returns false when rectangle exceeds element bounds', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 10, h: 10 });
            expect(containsRect(el, 5, 5, 10, 10)).to.be.false;
        });
        it('returns false when rectangle is completely outside', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 5, h: 5 });
            expect(containsRect(el, 10, 10, 3, 3)).to.be.false;
        });
    });
    describe('overlapsRect', () => {
        it('returns true when element overlaps the rectangle', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 10, h: 10 });
            expect(overlapsRect(el, 5, 5, 10, 10)).to.be.true;
        });
        it('returns true when rectangle is inside element', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 10, h: 10 });
            expect(overlapsRect(el, 2, 2, 3, 3)).to.be.true;
        });
        it('returns false when rectangle is completely outside', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 5, h: 5 });
            expect(overlapsRect(el, 10, 10, 3, 3)).to.be.false;
        });
        it('returns false when touching edges only', () => {
            const el = createElementWithSLD('Substation', { x: 0, y: 0, w: 5, h: 5 });
            expect(overlapsRect(el, 5, 0, 5, 5)).to.be.false;
        });
    });
});
//# sourceMappingURL=element-geometry.spec.js.map