import { expect } from '@open-wc/testing';
import { nearestWindingTerminalTarget, transformerWindingMeasures, windingTerminalTargets, } from './transformer.js';
import { createSCLDoc } from '../test-helpers.js';
const groundedN1 = '<NeutralPoint name="N1" cNodeName="grounded"/>';
const groundedN2 = '<NeutralPoint name="N2" cNodeName="grounded"/>';
/** Builds `count` windings, placing `neutral` XML inside winding `neutralOn`. */
function windingXml(count, neutralOn = -1, neutral = '') {
    let out = '';
    for (let i = 0; i < count; i += 1) {
        out += `<TransformerWinding name="W${i + 1}">${i === neutralOn ? neutral : ''}</TransformerWinding>`;
    }
    return out;
}
/** Computes winding measures for the winding at `index` of `inner`. */
function measures(inner, opts = {}, index = 0, zigZag = '') {
    const doc = createSCLDoc(`
    <Substation name="S1">
      <VoltageLevel name="V1">
        <Bay name="B1">
          <PowerTransformer name="T1">${inner}</PowerTransformer>
        </Bay>
      </VoltageLevel>
    </Substation>
  `);
    const winding = doc.querySelectorAll('TransformerWinding')[index];
    return transformerWindingMeasures(winding, [5, 3], { rot: opts.rot ?? 0, kind: opts.kind ?? 'default', flip: opts.flip ?? false }, zigZag);
}
describe('transformer', () => {
    describe('transformerWindingMeasures', () => {
        describe('single winding - default kind', () => {
            it('returns center, size, and terminal positions', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center).to.deep.equal([5.5, 3.5]);
                expect(result.size).to.equal(0.7);
                expect(result.terminals.N1).to.not.be.undefined;
                expect(result.terminals.N2).to.not.be.undefined;
            });
            it('provides arc geometry for single default winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.arc).to.not.be.undefined;
                expect(result.arc.from).to.not.be.undefined;
                expect(result.arc.to).to.not.be.undefined;
            });
            it('provides T1 terminal when no terminal element exists', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.terminals.T1).to.not.be.undefined;
                expect(result.terminals.T2).to.not.be.undefined;
            });
            it('omits T1 terminal when terminal element T1 exists', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1">
                    <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
                  </TransformerWinding>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.terminals.T1).to.be.undefined;
            });
        });
        describe('single winding - earthing kind', () => {
            it('provides N1 terminal and no arc', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'earthing', flip: false }, '');
                expect(result.terminals.N1).to.not.be.undefined;
                expect(result.arc).to.be.undefined;
                expect(result.zigZagTransform).to.equal('');
            });
            it('provides grounded N1 when neutral is grounded', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1">
                    <NeutralPoint name="N1" cNodeName="grounded"/>
                  </TransformerWinding>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'earthing', flip: false }, '');
                expect(result.grounded.N1).to.not.be.undefined;
                expect(result.grounded.N1).to.have.length(2);
            });
        });
        describe('two windings - default kind', () => {
            it('returns measures for first winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[0];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center).to.deep.equal([5.5, 3.5]);
                expect(result.terminals.T1).to.not.be.undefined;
            });
            it('shifts center for second winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[1];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center).to.deep.equal([5.5, 4.5]);
            });
        });
        describe('two windings - auto kind', () => {
            it('returns arc for first winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[0];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'auto', flip: false }, '');
                expect(result.arc).to.not.be.undefined;
            });
            it('honours flip on the first winding', () => {
                const noFlip = measures(windingXml(2), { kind: 'auto' }, 0);
                const flipped = measures(windingXml(2), { kind: 'auto', flip: true }, 0);
                expect(flipped.terminals.T1).to.not.deep.equal(noFlip.terminals.T1);
            });
            it('returns T1 terminal for second winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[1];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'auto', flip: false }, '');
                expect(result.terminals.T1).to.not.be.undefined;
            });
        });
        describe('three windings', () => {
            it('returns measures for the first winding', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                  <TransformerWinding name="W3"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[0];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center).to.deep.equal([5.5, 3.5]);
                expect(result.terminals.T1).to.not.be.undefined;
            });
            it('offsets second winding center', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                  <TransformerWinding name="W3"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[1];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center[0]).to.equal(6);
                expect(result.center[1]).to.equal(4.5);
            });
            it('offsets third winding center', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                  <TransformerWinding name="W2"/>
                  <TransformerWinding name="W3"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelectorAll('TransformerWinding')[2];
                const result = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                expect(result.center[0]).to.equal(5);
                expect(result.center[1]).to.equal(4.5);
            });
        });
        describe('rotation', () => {
            it('adjusts terminal positions based on rotation', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const rot0 = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                const rot1 = transformerWindingMeasures(winding, [5, 3], { rot: 1, kind: 'default', flip: false }, '');
                expect(rot0.terminals.N1).to.not.deep.equal(rot1.terminals.N1);
            });
        });
        describe('flip', () => {
            it('inverts terminal positions when flipped', () => {
                const doc = createSCLDoc(`
          <Substation name="S1">
            <VoltageLevel name="V1">
              <Bay name="B1">
                <PowerTransformer name="T1">
                  <TransformerWinding name="W1"/>
                </PowerTransformer>
              </Bay>
            </VoltageLevel>
          </Substation>
        `);
                const winding = doc.querySelector('TransformerWinding');
                const noFlip = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: false }, '');
                const flipped = transformerWindingMeasures(winding, [5, 3], { rot: 0, kind: 'default', flip: true }, '');
                expect(noFlip.terminals.T1).to.not.deep.equal(flipped.terminals.T1);
            });
        });
        describe('grounded neutral points', () => {
            it('grounds N1 for a single default winding', () => {
                const result = measures(windingXml(1, 0, groundedN1), {
                    kind: 'default',
                });
                expect(result.grounded.N1).to.not.be.undefined;
                expect(result.grounded.N1).to.have.length(2);
                expect(result.terminals.N1).to.be.undefined;
            });
            it('grounds N2 for a single default winding', () => {
                const result = measures(windingXml(1, 0, groundedN2), {
                    kind: 'default',
                });
                expect(result.grounded.N2).to.not.be.undefined;
                expect(result.grounded.N1).to.be.undefined;
            });
            it('grounds N1 for an auto first winding', () => {
                const result = measures(windingXml(2, 0, groundedN1), { kind: 'auto' }, 0);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N1 for an auto second winding', () => {
                const result = measures(windingXml(2, 1, groundedN1), { kind: 'auto' }, 1);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N2 for an auto second winding', () => {
                const result = measures(windingXml(2, 1, groundedN2), { kind: 'auto' }, 1);
                expect(result.grounded.N2).to.not.be.undefined;
            });
            it('grounds N1 for a default two-winding first winding', () => {
                const result = measures(windingXml(2, 0, groundedN1), {
                    kind: 'default',
                }, 0);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N2 for a default two-winding first winding', () => {
                const result = measures(windingXml(2, 0, groundedN2), {
                    kind: 'default',
                }, 0);
                expect(result.grounded.N2).to.not.be.undefined;
            });
            it('grounds N1 for a default two-winding second winding', () => {
                const result = measures(windingXml(2, 1, groundedN1), {
                    kind: 'default',
                }, 1);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N2 for a default two-winding second winding', () => {
                const result = measures(windingXml(2, 1, groundedN2), {
                    kind: 'default',
                }, 1);
                expect(result.grounded.N2).to.not.be.undefined;
            });
            it('grounds N1 for a three-winding first winding', () => {
                const result = measures(windingXml(3, 0, groundedN1), {}, 0);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N2 for a three-winding first winding', () => {
                const result = measures(windingXml(3, 0, groundedN2), {}, 0);
                expect(result.grounded.N2).to.not.be.undefined;
            });
            it('grounds N1 for a three-winding second winding', () => {
                const result = measures(windingXml(3, 1, groundedN1), {}, 1);
                expect(result.grounded.N1).to.not.be.undefined;
            });
            it('grounds N1 for a three-winding third winding', () => {
                const result = measures(windingXml(3, 2, groundedN1), {}, 2);
                expect(result.grounded.N1).to.not.be.undefined;
            });
        });
        describe('two windings - earthing kind', () => {
            it('applies the zig-zag transform and a T1 terminal on the first winding', () => {
                const result = measures(windingXml(2), { kind: 'earthing' }, 0, 'rotate(30)');
                expect(result.zigZagTransform).to.equal('rotate(30)');
                expect(result.terminals.T1).to.not.be.undefined;
                expect(result.terminals.N1).to.not.be.undefined;
            });
            it('grounds N1 on the first winding when the neutral is grounded', () => {
                const result = measures(windingXml(2, 0, groundedN1), { kind: 'earthing' }, 0, 'rotate(30)');
                expect(result.grounded.N1).to.not.be.undefined;
                expect(result.terminals.N1).to.be.undefined;
            });
            it('honours flip on the first winding', () => {
                const result = measures(windingXml(2), { kind: 'earthing', flip: true }, 0, 'rotate(30)');
                expect(result.terminals.T1).to.not.be.undefined;
            });
            it('places a T1 terminal on the second winding without a zig-zag transform', () => {
                const result = measures(windingXml(2), { kind: 'earthing' }, 1, 'rotate(30)');
                expect(result.terminals.T1).to.not.be.undefined;
                expect(result.zigZagTransform).to.be.undefined;
            });
        });
    });
    describe('winding connection targets', () => {
        function targetsOf(inner, index = 0, rot = 0) {
            const doc = createSCLDoc(`
        <Substation name="S1"><VoltageLevel name="V1"><Bay name="B1">
          <PowerTransformer name="T1">${inner}</PowerTransformer>
        </Bay></VoltageLevel></Substation>
      `);
            return windingTerminalTargets(doc.querySelectorAll('TransformerWinding')[index], [5, 3], { rot, kind: 'default', flip: false });
        }
        it('lists every open terminal with a half-grid approach point', () => {
            const targets = targetsOf(windingXml(1));
            expect(targets.map(t => t.terminal).sort()).to.deep.equal([
                'N1',
                'N2',
                'T1',
                'T2',
            ]);
            targets.forEach(({ near, far }) => {
                expect(Number.isInteger(far[0] * 2) && Number.isInteger(far[1] * 2)).to
                    .be.true;
                expect(near[0] === far[0] || near[1] === far[1]).to.be.true;
            });
        });
        it('approaches each terminal from outside the winding', () => {
            const [first] = targetsOf(windingXml(2), 0).filter(t => t.terminal === 'T1');
            // T1 of the top winding of an upright 2-winding transformer faces up
            expect(first.near[0]).to.equal(first.far[0]);
            expect(first.far[1]).to.be.lessThan(first.near[1]);
        });
        it('omits terminals that are already connected', () => {
            const targets = targetsOf('<TransformerWinding name="W1"><Terminal name="T1"/></TransformerWinding>');
            expect(targets.map(t => t.terminal)).to.not.include.members(['T1', 'T2']);
        });
        it('omits neutral terminals once a neutral exists', () => {
            const targets = targetsOf(windingXml(1, 0, groundedN1));
            expect(targets.map(t => t.terminal)).to.not.include.members(['N1', 'N2']);
        });
        it('picks the nearest target within reach', () => {
            const targets = targetsOf(windingXml(1));
            const t1 = targets.find(t => t.terminal === 'T1');
            expect(nearestWindingTerminalTarget(targets, [t1.near[0], t1.near[1] + 0.2])
                ?.terminal).to.equal('T1');
        });
        it('picks nothing when the cursor is out of reach', () => {
            const targets = targetsOf(windingXml(1));
            expect(nearestWindingTerminalTarget(targets, [100, 100])).to.be.undefined;
        });
    });
});
//# sourceMappingURL=transformer.spec.js.map