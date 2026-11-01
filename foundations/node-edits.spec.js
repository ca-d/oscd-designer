import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import { disconnectSectionEdits, joinPoint, sectionTerminals, wireConnectEdits, } from './node-edits.js';
import { attributes, getSLDAttributes } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';
const layout = (attrs) => `<Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes ${attrs}/></Private>`;
/** Q`n` sits at x = 2n, y = 8 with its top terminal (uuid `u<n>`) on node `cNode`. */
const equipment = (n, cNode) => `
  <ConductingEquipment name="Q${n}" type="CBR">
    ${layout(`smth:x="${2 * n}" smth:y="8"`)}
    ${cNode
    ? `<Terminal name="T1" connectivityNode="S1/V1/B1/${cNode}" substationName="S1"
        voltageLevelName="V1" bayName="B1" cNodeName="${cNode}">${layout(`smth:uuid="u${n}"`)}</Terminal>`
    : ''}
  </ConductingEquipment>`;
const vertex = ([x, y], uuid) => `<smth:Vertex smth:x="${x}" smth:y="${y}"${uuid ? ` smth:uuid="${uuid}"` : ''}/>`;
/** A wire from the top terminal of Q`n` up to `to`. */
const feeder = (n, to) => `<smth:Section>${vertex([2 * n + 0.5, 8.16], `u${n}`)}${vertex([2 * n + 0.5, to[1]])}${to[0] === 2 * n + 0.5 ? '' : vertex(to)}</smth:Section>`;
const wire = (...points) => `<smth:Section>${points.map(point => vertex(point)).join('')}</smth:Section>`;
const node = (name, ...sections) => `<ConnectivityNode name="${name}" pathName="S1/V1/B1/${name}">
    <Private type="OpenSCD-SLD-Layout">${sections.join('')}</Private>
  </ConnectivityNode>`;
function bay(...children) {
    return createSCLDoc(`
    <Substation name="S1">
      ${layout('smth:w="40" smth:h="20"')}
      <VoltageLevel name="V1">
        ${layout('smth:x="1" smth:y="1" smth:w="30" smth:h="15"')}
        <Bay name="B1">
          ${layout('smth:x="2" smth:y="2" smth:w="25" smth:h="12"')}
          ${children.join('')}
        </Bay>
      </VoltageLevel>
    </Substation>`);
}
const sections = (doc) => Array.from(doc.getElementsByTagNameNS(sldNs, 'Section'));
const cNodeOf = (doc, n) => doc.querySelector(`ConductingEquipment[name="Q${n}"] > Terminal`)?.getAttribute('cNodeName');
const sectionsIn = (doc, name) => Array.from(doc
    .querySelector(`ConnectivityNode[name="${name}"]`)
    ?.getElementsByTagNameNS(sldNs, 'Section') ?? []);
const pointsOf = (section) => Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(vertex => attributes(vertex).pos);
describe('node edits', () => {
    describe('disconnecting a wire', () => {
        /** Q1 and Q2 meet at (3.5, 5), Q3 and Q4 at (7.5, 5), and a wire joins the two places. */
        function twoStars() {
            return bay(equipment(1, 'L1'), equipment(2, 'L1'), equipment(3, 'L1'), equipment(4, 'L1'), node('L1', feeder(1, [3.5, 5]), wire([3.5, 5], [4.5, 5]), feeder(2, [4.5, 5]), wire([4.5, 5], [8.5, 5]), feeder(3, [8.5, 5]), feeder(4, [8.5, 5])));
        }
        it('takes the equipment at its end off the node', () => {
            const doc = bay(equipment(1, 'L1'), equipment(2, 'L1'), equipment(3, 'L1'), node('L1', feeder(1, [4.5, 5]), feeder(2, [4.5, 5]), feeder(3, [4.5, 5])));
            const [, , third] = sections(doc);
            expect(sectionTerminals(third).map(t => t.closest('ConductingEquipment').getAttribute('name'))).to.deep.equal(['Q3']);
            handleEdit(disconnectSectionEdits(third));
            expect(cNodeOf(doc, 3)).to.be.undefined;
            expect([cNodeOf(doc, 1), cNodeOf(doc, 2)]).to.deep.equal(['L1', 'L1']);
            expect(sections(doc)).to.have.lengthOf(2);
        });
        it('splits the node where the wire held it together', () => {
            const doc = twoStars();
            const middle = sections(doc)[3];
            expect(sectionTerminals(middle)).to.have.lengthOf(0);
            handleEdit(disconnectSectionEdits(middle));
            expect([1, 2, 3, 4].map(n => cNodeOf(doc, n))).to.deep.equal([
                'L1',
                'L1',
                'L2',
                'L2',
            ]);
            expect(doc.querySelector('ConductingEquipment[name="Q3"] > Terminal').getAttribute('connectivityNode')).to.equal('S1/V1/B1/L2');
            expect(sectionsIn(doc, 'L1')).to.have.lengthOf(3);
            expect(sectionsIn(doc, 'L2')).to.have.lengthOf(2);
            expect(doc.querySelector('ConnectivityNode[name="L2"]').getAttribute('pathName')).to.equal('S1/V1/B1/L2');
        });
        it('takes off what would be left connected to nothing else', () => {
            const doc = twoStars();
            // Without Q4, Q3 would be left alone once the middle wire is gone.
            handleEdit(disconnectSectionEdits(sections(doc)[5]));
            handleEdit(disconnectSectionEdits(sections(doc)[3]));
            expect([1, 2, 3, 4].map(n => cNodeOf(doc, n))).to.deep.equal([
                'L1',
                'L1',
                undefined,
                undefined,
            ]);
            expect(sections(doc)).to.have.lengthOf(3);
        });
        it('removes a node that connected two pieces of equipment directly', () => {
            const doc = bay(equipment(1, 'L1'), equipment(2, 'L1'), node('L1', `<smth:Section>${vertex([2.5, 8.16], 'u1')}${vertex([2.5, 6])}${vertex([4.5, 6])}${vertex([4.5, 8.16], 'u2')}</smth:Section>`));
            handleEdit(disconnectSectionEdits(sections(doc)[0]));
            expect(doc.querySelector('ConnectivityNode')).to.be.null;
            expect(doc.querySelector('Terminal')).to.be.null;
        });
    });
    describe('connecting from a wire', () => {
        it('branches off the wire to the terminal of other equipment', () => {
            const doc = bay(equipment(1, 'L1'), equipment(2, 'L1'), equipment(5), node('L1', `<smth:Section>${vertex([2.5, 8.16], 'u1')}${vertex([2.5, 6])}${vertex([4.5, 6])}${vertex([4.5, 8.16], 'u2')}</smth:Section>`));
            const [section] = sections(doc);
            const q5 = doc.querySelector('ConductingEquipment[name="Q5"]');
            handleEdit(wireConnectEdits({
                from: section,
                fromTerminal: 'T1',
                to: q5,
                toTerminal: 'T1',
                path: [[3.5, 6], [3.5, 5], [10.5, 5], [10.5, 8.16]],
            }, doc, 'smth'));
            expect(cNodeOf(doc, 5)).to.equal('L1');
            const terminal = q5.querySelector('Terminal');
            expect(terminal.getAttribute('connectivityNode')).to.equal('S1/V1/B1/L1');
            const all = sections(doc).map(pointsOf);
            expect(all).to.have.lengthOf(3);
            expect(all.filter(points => points.some(([x, y]) => x === 3.5 && y === 6))).to.have.lengthOf(3);
            const branch = sections(doc).find(s => Array.from(s.getElementsByTagNameNS(sldNs, 'Vertex')).some(v => getSLDAttributes(v, 'uuid') === getSLDAttributes(terminal, 'uuid')));
            expect(pointsOf(branch)[0]).to.deep.equal([3.5, 6]);
        });
        it('joins two connectivity nodes into one', () => {
            const doc = bay(equipment(1, 'L1'), equipment(2, 'L1'), equipment(3, 'L2'), equipment(4, 'L2'), node('L1', `<smth:Section>${vertex([2.5, 8.16], 'u1')}${vertex([2.5, 6])}${vertex([4.5, 6])}${vertex([4.5, 8.16], 'u2')}</smth:Section>`), node('L2', `<smth:Section>${vertex([6.5, 8.16], 'u3')}${vertex([6.5, 6])}${vertex([8.5, 6])}${vertex([8.5, 8.16], 'u4')}</smth:Section>`));
            const [first] = sections(doc);
            handleEdit(wireConnectEdits({
                from: first,
                fromTerminal: 'T1',
                to: doc.querySelector('ConnectivityNode[name="L2"]'),
                path: [[3.5, 6], [3.5, 4], [7.5, 4], [7.5, 6]],
            }, doc, 'smth'));
            expect(doc.querySelectorAll('ConnectivityNode')).to.have.lengthOf(1);
            expect([1, 2, 3, 4].map(n => cNodeOf(doc, n))).to.deep.equal([
                'L1',
                'L1',
                'L1',
                'L1',
            ]);
            expect(sectionsIn(doc, 'L1')).to.have.lengthOf(5);
        });
        it('keeps the node of a bus bar when joining it', () => {
            const doc = bay(equipment(1, 'L1'), equipment(2, 'L1'), node('L1', `<smth:Section>${vertex([2.5, 8.16], 'u1')}${vertex([2.5, 6])}${vertex([4.5, 6])}${vertex([4.5, 8.16], 'u2')}</smth:Section>`), node('L2', `<smth:Section smth:bus="true">${vertex([2.5, 3.5])}${vertex([9.5, 3.5])}</smth:Section>`));
            const [first] = sections(doc);
            handleEdit(wireConnectEdits({
                from: first,
                fromTerminal: 'T1',
                to: doc.querySelector('ConnectivityNode[name="L2"]'),
                path: [[3.5, 6], [3.5, 3.5]],
            }, doc, 'smth'));
            expect(Array.from(doc.querySelectorAll('ConnectivityNode')).map(n => n.getAttribute('name'))).to.deep.equal(['L2']);
            expect([cNodeOf(doc, 1), cNodeOf(doc, 2)]).to.deep.equal(['L2', 'L2']);
            expect(sectionsIn(doc, 'L2').filter(s => getSLDAttributes(s, 'bus') === 'true')).to.have.lengthOf(2);
        });
    });
    describe('joinPoint', () => {
        it('is the nearest point of the wire on the half grid, not on a terminal', () => {
            const doc = bay(equipment(1, 'L1'), node('L1', `<smth:Section>${vertex([2.5, 8.16], 'u1')}${vertex([2.5, 6])}${vertex([6.5, 6])}</smth:Section>`));
            const [section] = sections(doc);
            expect(joinPoint(section, [4.2, 6.4])).to.deep.equal([4, 6]);
            expect(joinPoint(section, [2.5, 9])).to.deep.equal([2.5, 8]);
        });
    });
});
//# sourceMappingURL=node-edits.spec.js.map