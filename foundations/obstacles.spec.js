import { expect } from '@open-wc/testing';
import { obstacleRects } from './obstacles.js';
import { sldFixture } from '../test-helpers.js';
function transformer(windings, attrs = '') {
    const doc = sldFixture({
        children: `<PowerTransformer name="T1">
      <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="3" smth:y="5" ${attrs}/></Private>
      ${Array.from({ length: windings }, (_, i) => `<TransformerWinding name="W${i + 1}"/>`).join('')}
    </PowerTransformer>`,
    });
    return doc.querySelector('PowerTransformer');
}
describe('obstacleRects', () => {
    it('is the square of equipment', () => {
        const doc = sldFixture({
            children: `<ConductingEquipment name="Q1" type="CBR">
        <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="3" smth:y="5"/></Private>
      </ConductingEquipment>`,
        });
        expect(obstacleRects(doc.querySelector('ConductingEquipment'))).to.deep.equal([
            [3, 5, 1, 1],
        ]);
    });
    it('is the square of a transformer without windings', () => {
        expect(obstacleRects(transformer(0))).to.deep.equal([[3, 5, 1, 1]]);
    });
    const rounded = (rects) => rects.map(rect => rect.map(value => Math.round(value * 100) / 100));
    it('blocks 1.8 around the centre of a single winding', () => {
        expect(rounded(obstacleRects(transformer(1)))).to.deep.equal([
            [2.6, 4.6, 1.8, 1.8],
        ]);
    });
    it('stacks the areas of two windings', () => {
        expect(rounded(obstacleRects(transformer(2)))).to.deep.equal([
            [2.6, 4.6, 1.8, 1.8],
            [2.6, 5.6, 1.8, 1.8],
        ]);
    });
    it('turns with the transformer', () => {
        expect(rounded(obstacleRects(transformer(2, 'smth:rot="1"')))).to.deep.equal([
            [2.6, 4.6, 1.8, 1.8],
            [1.6, 4.6, 1.8, 1.8],
        ]);
    });
    it('overlaps the two lower windings of three', () => {
        const [, left, right] = rounded(obstacleRects(transformer(3)));
        expect(left).to.deep.equal([3.1, 5.6, 1.8, 1.8]);
        expect(right).to.deep.equal([2.1, 5.6, 1.8, 1.8]);
    });
    it('can be asked for another position and turn', () => {
        expect(rounded(obstacleRects(transformer(1), [6, 7], 1))).to.deep.equal([
            [5.6, 6.6, 1.8, 1.8],
        ]);
    });
});
//# sourceMappingURL=obstacles.spec.js.map