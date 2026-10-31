import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';
import { busBarVertexEdits } from './bus-bar-edits.js';
import { attributes, getSLDAttributes } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
import { sldFixture } from '../test-helpers.js';
const vertex = (x, y, uuid) => `<smth:Vertex smth:x="${x}" smth:y="${y}"${uuid ? ` smth:uuid="${uuid}"` : ''}/>`;
const bus = (...points) => `<smth:Section smth:bus="true">${points.map(([x, y]) => vertex(x, y)).join('')}</smth:Section>`;
const wire = (...points) => `<smth:Section>${points.map(([x, y, uuid]) => vertex(x, y, uuid)).join('')}</smth:Section>`;
/** A bus bar along y = 3 with the given sections, and a piece of equipment hanging off its feeder at `x`. */
function busBar(sections) {
    return sldFixture({
        bayName: 'BB1',
        children: `
      <ConductingEquipment name="Q1" type="CBR">
        <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="1" smth:y="7"/></Private>
        <Terminal name="T1" connectivityNode="S1/V1/BB1/L1">
          <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:uuid="u1"/></Private>
        </Terminal>
      </ConductingEquipment>
      <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
        <Private type="OpenSCD-SLD-Layout">${sections.join('')}</Private>
      </ConnectivityNode>`,
    });
}
function sectionsOf(doc) {
    return Array.from(doc.getElementsByTagNameNS(sldNs, 'Section')).map(section => `${getSLDAttributes(section, 'bus') === 'true' ? 'bus' : 'wire'} ${Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'))
        .map(v => attributes(v).pos.join(','))
        .join(' ')}`);
}
function resize(doc, x, y) {
    const first = doc.getElementsByTagNameNS(sldNs, 'Vertex')[1];
    handleEdit(busBarVertexEdits(first, x, y, 'smth'));
}
const feeder = (x, uuid) => wire([x, 3], [x, 6, uuid]);
describe('busBarVertexEdits', () => {
    it('does nothing for other elements than vertices', () => {
        const doc = busBar([bus([2, 3], [6, 3])]);
        expect(busBarVertexEdits(doc.querySelector('Bay'), 9, 3, 'smth')).to.deep.equal([]);
    });
    it('does nothing for vertices of other than bus bars', () => {
        const doc = sldFixture({
            children: `<ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
        <Private type="OpenSCD-SLD-Layout">${wire([2, 3], [6, 3])}</Private>
      </ConnectivityNode>`,
        });
        const first = doc.getElementsByTagNameNS(sldNs, 'Vertex')[0];
        expect(busBarVertexEdits(first, 9, 3, 'smth')).to.deep.equal([]);
    });
    it('resizes a bus bar without feeders', () => {
        const doc = busBar([bus([2, 3], [6, 3])]);
        resize(doc, 9, 3);
        expect(sectionsOf(doc)).to.deep.equal(['bus 2,3 9,3']);
        const bay = doc.querySelector('Bay');
        expect(attributes(bay).dim).to.deep.equal([8, 1]);
    });
    describe('growing', () => {
        it('keeps the feeders attached', () => {
            const doc = busBar([
                bus([2, 3], [4, 3]),
                bus([4, 3], [6, 3]),
                feeder(4, 'u1'),
            ]);
            resize(doc, 9, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 4,3',
                'bus 4,3 9,3',
                'wire 4,3 4,6',
            ]);
            expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(1);
        });
        it('cuts the bus bar where a feeder joins at its end', () => {
            const doc = busBar([bus([2, 3], [6, 3]), feeder(6, 'u1')]);
            resize(doc, 9, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 6,3',
                'bus 6,3 9,3',
                'wire 6,3 6,6',
            ]);
        });
        it('takes wire left where the bus bar was shrunk back over it', () => {
            const doc = busBar([
                bus([2, 3], [5, 3]),
                wire([5, 3], [7, 3]),
                feeder(7, 'u1'),
            ]);
            resize(doc, 10, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 5,3',
                'bus 5,3 7,3',
                'bus 7,3 10,3',
                'wire 7,3 7,6',
            ]);
        });
        it('takes only as much wire as it grows over', () => {
            const doc = busBar([
                bus([2, 3], [5, 3]),
                wire([5, 3], [9, 3]),
                feeder(9, 'u1'),
            ]);
            resize(doc, 7, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 5,3',
                'bus 5,3 7,3',
                'wire 7,3 9,3',
                'wire 9,3 9,6',
            ]);
        });
    });
    describe('shrinking', () => {
        it('keeps a feeder beyond the new end connected with wire', () => {
            const doc = busBar([
                bus([2, 3], [7, 3]),
                bus([7, 3], [10, 3]),
                feeder(7, 'u1'),
            ]);
            resize(doc, 5, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 5,3',
                'wire 5,3 7,3',
                'wire 7,3 7,6',
            ]);
            expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(1);
            expect(attributes(doc.querySelector('Bay')).dim).to.deep.equal([4, 1]);
        });
        it('keeps every feeder beyond the new end connected', () => {
            const doc = busBar([
                bus([2, 3], [4, 3]),
                bus([4, 3], [7, 3]),
                bus([7, 3], [10, 3]),
                feeder(4),
                feeder(7, 'u1'),
            ]);
            resize(doc, 3, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 3,3',
                'wire 3,3 4,3',
                'wire 4,3 7,3',
                'wire 4,3 4,6',
                'wire 7,3 7,6',
            ]);
        });
        it('removes what is beyond the furthest feeder', () => {
            const doc = busBar([
                bus([2, 3], [4, 3]),
                bus([4, 3], [10, 3]),
                feeder(4),
            ]);
            resize(doc, 6, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 4,3',
                'bus 4,3 6,3',
                'wire 4,3 4,6',
            ]);
        });
        it('keeps a feeder at the new end where it is', () => {
            const doc = busBar([
                bus([2, 3], [7, 3]),
                bus([7, 3], [10, 3]),
                feeder(7),
            ]);
            resize(doc, 7, 3);
            expect(sectionsOf(doc)).to.deep.equal(['bus 2,3 7,3', 'wire 7,3 7,6']);
        });
        it('keeps wire already beyond the bus bar', () => {
            const doc = busBar([
                bus([2, 3], [5, 3]),
                wire([5, 3], [7, 3]),
                feeder(7),
            ]);
            resize(doc, 3, 3);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 3,3',
                'wire 3,3 5,3',
                'wire 5,3 7,3',
                'wire 7,3 7,6',
            ]);
        });
    });
    describe('turning', () => {
        it('turns a bus bar without feeders', () => {
            const doc = busBar([bus([2, 3], [6, 3])]);
            resize(doc, 2, 7);
            expect(sectionsOf(doc)).to.deep.equal(['bus 2,3 2,7']);
            expect(attributes(doc.querySelector('Bay')).dim).to.deep.equal([1, 5]);
        });
        it('leaves the old line as wire to its feeders', () => {
            const doc = busBar([
                bus([2, 3], [4, 3]),
                bus([4, 3], [6, 3]),
                feeder(4, 'u1'),
            ]);
            resize(doc, 2, 7);
            expect(sectionsOf(doc)).to.deep.equal([
                'bus 2,3 2,7',
                'wire 2,3 4,3',
                'wire 4,3 4,6',
            ]);
            expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(1);
        });
    });
});
//# sourceMappingURL=bus-bar-edits.spec.js.map