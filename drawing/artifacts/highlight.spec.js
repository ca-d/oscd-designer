import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';
import { getHighlightStyle, isSelectable, isToBeHighlighted, } from './highlight.js';
import { createSCLDoc } from '../../test-helpers.js';
describe('artifact highlight helpers', () => {
    const doc = createSCLDoc(`
    <Substation name="S1">
      <VoltageLevel name="V1">
        <Bay name="B1">
          <ConductingEquipment name="E1" type="DIS"/>
        </Bay>
      </VoltageLevel>
    </Substation>
  `);
    const equipment = doc.querySelector('ConductingEquipment');
    const id = `${identity(equipment)}`;
    describe('isSelectable', () => {
        it('is true when the element identity is in the selectable list', () => {
            expect(isSelectable(equipment, [id])).to.be.true;
        });
        it('is false for an empty selectable list', () => {
            expect(isSelectable(equipment, [])).to.be.false;
        });
        it('is false when only other identities are selectable', () => {
            expect(isSelectable(equipment, ['some>other>id'])).to.be.false;
        });
    });
    describe('isToBeHighlighted', () => {
        it('is true when a highlight entry matches the element identity', () => {
            const highlight = [{ id, style: { fill: 'red' } }];
            expect(isToBeHighlighted(equipment, highlight)).to.be.true;
        });
        it('is false when no highlight entry matches', () => {
            const highlight = [
                { id: 'other>id', style: { fill: 'red' } },
            ];
            expect(isToBeHighlighted(equipment, highlight)).to.be.false;
        });
    });
    describe('getHighlightStyle', () => {
        it('returns an empty string when the element is not highlighted', () => {
            expect(getHighlightStyle(equipment, [])).to.equal('');
        });
        it('serialises every provided style property', () => {
            const highlight = [
                {
                    id,
                    style: {
                        fill: 'red',
                        fillOpacity: 0.5,
                        stroke: 'blue',
                        strokeWidth: 2,
                        strokeOpacity: 0.8,
                        rx: 3,
                    },
                },
            ];
            expect(getHighlightStyle(equipment, highlight)).to.equal('fill: red; fill-opacity: 0.5; stroke: blue; stroke-width: 2; stroke-opacity: 0.8; rx: 3; ');
        });
        it('omits unset style properties', () => {
            const highlight = [{ id, style: { stroke: 'green' } }];
            expect(getHighlightStyle(equipment, highlight)).to.equal('stroke: green; ');
        });
    });
});
//# sourceMappingURL=highlight.spec.js.map