import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import {
  busBarResizeEdits,
  draggedBusBarRect,
  resizedBusBarRect,
} from './bus-bar-edits.js';
import { attributes, getSLDAttributes } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
import { sldFixture } from '../test-helpers.js';

import type { Point, Rect } from './geometry.js';

const vertex = (x: number, y: number, uuid?: string) =>
  `<smth:Vertex smth:x="${x}" smth:y="${y}"${uuid ? ` smth:uuid="${uuid}"` : ''}/>`;

const bus = (...points: [number, number][]) =>
  `<smth:Section smth:bus="true">${points.map(([x, y]) => vertex(x, y)).join('')}</smth:Section>`;

const wire = (...points: [number, number, string?][]) =>
  `<smth:Section>${points.map(([x, y, uuid]) => vertex(x, y, uuid)).join('')}</smth:Section>`;

const equipment = (name: string, x: number, uuid: string) => `
  <ConductingEquipment name="${name}" type="CBR">
    <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="${x}" smth:y="6"/></Private>
    <Terminal name="T1" connectivityNode="S1/V1/BB1/L1">
      <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:uuid="${uuid}"/></Private>
    </Terminal>
  </ConductingEquipment>`;

/**
 * A bus bar through the cells (2,3) to (6,3), on the line from (2.5,3.5) to
 * (6.5,3.5), and circuit breakers at x = 3, 5 and 7 below it (their top
 * terminals at x = 3.5, 5.5 and 7.5), wired up as `sections` say.
 */
function busBar(sections: string[]) {
  return sldFixture({
    bay: { x: 2, y: 3, w: 5, h: 1 },
    bayName: 'BB1',
    children: `
      ${equipment('Q1', 3, 'u1')}
      ${equipment('Q2', 5, 'u2')}
      ${equipment('Q3', 7, 'u3')}
      <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
        <Private type="OpenSCD-SLD-Layout">${sections.join('')}</Private>
      </ConnectivityNode>`,
  });
}

/** Feeders of Q1 and Q2 joining the bus bar, which is cut where they join. */
const wired = () =>
  busBar([
    bus([2.5, 3.5], [3.5, 3.5]),
    bus([3.5, 3.5], [5.5, 3.5]),
    bus([5.5, 3.5], [6.5, 3.5]),
    wire([3.5, 3.5], [3.5, 6.16, 'u1']),
    wire([5.5, 3.5], [5.5, 6.16, 'u2']),
  ]);

function sectionsOf(doc: XMLDocument): Element[] {
  return Array.from(doc.getElementsByTagNameNS(sldNs, 'Section'));
}

function pointsOf(section: Element): Point[] {
  return Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(
    v => attributes(v).pos,
  );
}

const isBus = (section: Element) => getSLDAttributes(section, 'bus') === 'true';

const buses = (doc: XMLDocument) =>
  sectionsOf(doc)
    .filter(isBus)
    .map(pointsOf);

const wires = (doc: XMLDocument) =>
  sectionsOf(doc)
    .filter(section => !isBus(section))
    .map(pointsOf);

function resize(doc: XMLDocument, rect: Rect) {
  handleEdit(
    busBarResizeEdits(doc, doc.querySelector('Bay[name="BB1"]')!, rect, 'smth'),
  );
}

/** Every wire is orthogonal and every terminal is where its vertex is. */
function expectOrthogonal(doc: XMLDocument) {
  sectionsOf(doc).forEach((section) => {
    const points = pointsOf(section);
    points.slice(1).forEach(([x, y], i) => {
      expect(x === points[i][0] || y === points[i][1], `${points}`).to.be.true;
    });
  });
}

/** Where the feeders of the terminals `u1`, `u2` meet the bus bar. */
function joins(doc: XMLDocument, ...uuids: string[]): Point[] {
  return uuids.map((uuid) => {
    const section = sectionsOf(doc).find(s =>
      Array.from(s.getElementsByTagNameNS(sldNs, 'Vertex')).some(
        v => getSLDAttributes(v, 'uuid') === uuid,
      ),
    )!;
    const [first, last] = [
      section.getElementsByTagNameNS(sldNs, 'Vertex')[0],
      Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).pop()!,
    ];
    return attributes(getSLDAttributes(first, 'uuid') === uuid ? last : first)
      .pos;
  });
}

describe('resizedBusBarRect', () => {
  const bay = () => busBar([bus([2.5, 3.5], [6.5, 3.5])]).querySelector('Bay')!;

  it('runs the bottom or right end to the cursor, along the longer distance', () => {
    expect(resizedBusBarRect(bay(), 'BR', [9, 3])).to.deep.equal([2, 3, 8, 1]);
    expect(resizedBusBarRect(bay(), 'BR', [3, 7])).to.deep.equal([2, 3, 1, 5]);
    expect(resizedBusBarRect(bay(), 'BR', [3, 4])).to.deep.equal([2, 3, 1, 2]);
  });

  it('runs the top or left end to the cursor, along the longer distance', () => {
    expect(resizedBusBarRect(bay(), 'TL', [4, 3])).to.deep.equal([4, 3, 3, 1]);
    expect(resizedBusBarRect(bay(), 'TL', [6, 1])).to.deep.equal([6, 1, 1, 3]);
  });

  it('keeps a bus bar two cells long', () => {
    expect(resizedBusBarRect(bay(), 'BR', [2, 3])).to.deep.equal([2, 3, 2, 1]);
    expect(resizedBusBarRect(bay(), 'TL', [8, 3])).to.deep.equal([5, 3, 2, 1]);
  });

  it('keeps to its voltage level', () => {
    // The voltage level covers 1,1 to 20,20.
    expect(resizedBusBarRect(bay(), 'BR', [30, 3])).to.deep.equal([2, 3, 19, 1]);
    expect(resizedBusBarRect(bay(), 'TL', [6, -4])).to.deep.equal([6, 1, 1, 3]);
    expect(resizedBusBarRect(bay(), 'BR', [3, 30])).to.deep.equal([2, 3, 1, 18]);
  });
});

describe('draggedBusBarRect', () => {
  it('runs along the longer distance from the anchor to the cursor', () => {
    expect(draggedBusBarRect([3, 4], [7, 5])).to.deep.equal([3, 4, 5, 1]);
    expect(draggedBusBarRect([7, 4], [3, 5])).to.deep.equal([3, 4, 5, 1]);
    expect(draggedBusBarRect([3, 4], [4, 8])).to.deep.equal([3, 4, 1, 5]);
    expect(draggedBusBarRect([3, 8], [4, 4])).to.deep.equal([3, 4, 1, 5]);
  });

  it('is two cells long at least', () => {
    expect(draggedBusBarRect([3, 4], [3, 4])).to.deep.equal([3, 4, 2, 1]);
    expect(draggedBusBarRect([3, 4], [2, 4])).to.deep.equal([2, 4, 2, 1]);
  });
});

describe('busBarResizeEdits', () => {
  it('does nothing for other elements than bus bars', () => {
    const doc = sldFixture();

    expect(
      busBarResizeEdits(doc, doc.querySelector('Bay')!, [2, 3, 5, 1], 'smth'),
    ).to.deep.equal([]);
  });

  it('resizes a bus bar without feeders', () => {
    const doc = busBar([bus([2.5, 3.5], [6.5, 3.5])]);
    resize(doc, [2, 3, 8, 1]);

    expect(buses(doc)).to.deep.equal([[[2.5, 3.5], [9.5, 3.5]]]);
    expect(attributes(doc.querySelector('Bay')!).dim).to.deep.equal([8, 1]);
  });

  describe('growing', () => {
    it('keeps the feeders where they are and cuts the bus bar there', () => {
      const doc = wired();
      resize(doc, [2, 3, 8, 1]);

      expect(buses(doc)).to.deep.equal([
        [[2.5, 3.5], [3.5, 3.5]],
        [[3.5, 3.5], [5.5, 3.5]],
        [[5.5, 3.5], [9.5, 3.5]],
      ]);
      expect(wires(doc)).to.deep.equal([
        [[3.5, 3.5], [3.5, 6.16]],
        [[5.5, 3.5], [5.5, 6.16]],
      ]);
    });

    it('routes a feeder that ran into the end of it along it to join straight on', () => {
      const doc = busBar([
        bus([2.5, 3.5], [6.5, 3.5]),
        wire([6.5, 3.5], [7.5, 3.5], [7.5, 6.16, 'u3']),
      ]);
      resize(doc, [2, 3, 8, 1]);

      expectOrthogonal(doc);
      expect(wires(doc)).to.deep.equal([[[7.5, 3.5], [7.5, 6.16]]]);
      expect(buses(doc)).to.deep.equal([
        [[2.5, 3.5], [7.5, 3.5]],
        [[7.5, 3.5], [9.5, 3.5]],
      ]);
    });
  });

  describe('shrinking', () => {
    it('keeps the feeders that still join it', () => {
      const doc = wired();
      resize(doc, [2, 3, 4, 1]);

      expect(buses(doc)).to.deep.equal([
        [[2.5, 3.5], [3.5, 3.5]],
        [[3.5, 3.5], [5.5, 3.5]],
      ]);
      expect(wires(doc)).to.deep.equal([
        [[3.5, 3.5], [3.5, 6.16]],
        [[5.5, 3.5], [5.5, 6.16]],
      ]);
    });

    it('routes a feeder beyond the end of it to join it again', () => {
      const doc = wired();
      resize(doc, [2, 3, 3, 1]);

      expectOrthogonal(doc);
      const [, [q2]] = [joins(doc, 'u1'), joins(doc, 'u2')];
      // The line now runs from 2.5 to 4.5; Q1 keeps 3.5.
      expect(q2[1]).to.equal(3.5);
      expect(q2[0]).to.be.greaterThan(2.5);
      expect(q2[0]).to.be.lessThan(4.5);
      expect(q2[0]).to.not.equal(3.5);
      expect(joins(doc, 'u1')[0]).to.deep.equal([3.5, 3.5]);

      const cuts = buses(doc).map(([from]) => from[0]);
      expect(cuts).to.include(3.5);
      expect(cuts).to.include(q2[0]);
      const ends = buses(doc).flat();
      expect(Math.min(...ends.map(([x]) => x))).to.equal(2.5);
      expect(Math.max(...ends.map(([x]) => x))).to.equal(4.5);
    });

    it('leaves the terminals of rerouted feeders where they are', () => {
      const doc = wired();
      resize(doc, [2, 3, 3, 1]);

      const feeder = sectionsOf(doc).find(
        section =>
          !isBus(section) &&
          Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).some(
            v => getSLDAttributes(v, 'uuid') === 'u2',
          ),
      )!;
      const points = pointsOf(feeder);
      expect(points[points.length - 1]).to.deep.equal([5.5, 6.16]);
      // It leaves the terminal straight, along the stub.
      expect(points[points.length - 2][0]).to.equal(5.5);
    });

    it('spreads the feeders it had to move over the length of it', () => {
      const doc = busBar([
        bus([2.5, 3.5], [3.5, 3.5]),
        bus([3.5, 3.5], [5.5, 3.5]),
        bus([5.5, 3.5], [7.5, 3.5]),
        wire([3.5, 3.5], [3.5, 6.16, 'u1']),
        wire([5.5, 3.5], [5.5, 6.16, 'u2']),
        wire([7.5, 3.5], [7.5, 6.16, 'u3']),
      ]);
      resize(doc, [2, 3, 3, 1]);

      expectOrthogonal(doc);
      const at = joins(doc, 'u1', 'u2', 'u3').map(([x]) => x);
      expect(new Set(at).size).to.equal(3);
      at.forEach((x) => {
        expect(x).to.be.greaterThan(2.5);
        expect(x).to.be.lessThan(4.5);
      });
    });
  });

  describe('resizing from the top or left', () => {
    it('moves the start and routes the feeders it leaves behind', () => {
      const doc = wired();
      resize(doc, [4, 3, 3, 1]);

      expectOrthogonal(doc);
      expect(attributes(doc.querySelector('Bay[name="BB1"]')!).pos).to.deep.equal([4, 3]);
      const [[q1x, q1y]] = joins(doc, 'u1');
      expect(q1y).to.equal(3.5);
      expect(q1x).to.be.greaterThan(4.5);
      expect(q1x).to.be.lessThan(6.5);
      expect(joins(doc, 'u2')[0]).to.deep.equal([5.5, 3.5]);
    });
  });

  describe('with feeders on both sides', () => {
    /** Q4 hangs above the bus bar at x = 4.5, Q2 below it joins beyond its new end. */
    function opposite() {
      return sldFixture({
        bay: { x: 2, y: 3, w: 7, h: 1 },
        bayName: 'BB1',
        children: `
          <ConductingEquipment name="Q4" type="CBR">
            <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="4" smth:y="0"/></Private>
            <Terminal name="T2" connectivityNode="S1/V1/BB1/L1">
              <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:uuid="u4"/></Private>
            </Terminal>
          </ConductingEquipment>
          <ConductingEquipment name="Q2" type="CBR">
            <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:x="4" smth:y="6"/></Private>
            <Terminal name="T1" connectivityNode="S1/V1/BB1/L1">
              <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:uuid="u2"/></Private>
            </Terminal>
          </ConductingEquipment>
          <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
            <Private type="OpenSCD-SLD-Layout">
              ${bus([2.5, 3.5], [4.5, 3.5])}
              ${bus([4.5, 3.5], [8.5, 3.5])}
              ${wire([4.5, 0.84, 'u4'], [4.5, 3.5])}
              ${wire([4.5, 6.16, 'u2'], [4.5, 5], [8.5, 5], [8.5, 3.5])}
            </Private>
          </ConnectivityNode>`,
      });
    }

    it('joins a feeder right opposite one on the other side', () => {
      const doc = opposite();
      resize(doc, [2, 3, 5, 1]);

      expectOrthogonal(doc);
      expect(joins(doc, 'u4', 'u2')).to.deep.equal([
        [4.5, 3.5],
        [4.5, 3.5],
      ]);
      expect(wires(doc)).to.deep.include([[4.5, 6.16], [4.5, 3.5]]);
    });

    it('joins two feeders it moves right opposite each other', () => {
      const doc = opposite();
      const [, , above] = sectionsOf(doc);
      above.replaceWith(
        new DOMParser().parseFromString(
          `<smth:Section xmlns:smth="${sldNs}">${[
            [4.5, 0.84, 'u4'],
            [4.5, 2],
            [8.5, 2],
            [8.5, 3.5],
          ]
            .map(([x, y, uuid]) => vertex(x as number, y as number, uuid as string))
            .join('')}</smth:Section>`,
          'application/xml',
        ).documentElement,
      );
      resize(doc, [2, 3, 5, 1]);

      expectOrthogonal(doc);
      expect(joins(doc, 'u4', 'u2')).to.deep.equal([
        [4.5, 3.5],
        [4.5, 3.5],
      ]);
    });

    it('does not join two feeders from the same side at one place', () => {
      const doc = opposite();
      // Q5 joins from below at x = 4.5 instead of Q4 from above.
      doc.querySelector('ConductingEquipment[name="Q4"] SLDAttributes')!
        .setAttributeNS(sldNs, 'smth:x', '3');
      const q4 = doc.querySelector('ConductingEquipment[name="Q4"] SLDAttributes')!;
      q4.setAttributeNS(sldNs, 'smth:y', '4');
      q4.setAttributeNS(sldNs, 'smth:rot', '1');
      const [, , above] = sectionsOf(doc);
      const vertices = Array.from(above.getElementsByTagNameNS(sldNs, 'Vertex'));
      vertices[0].setAttributeNS(sldNs, 'smth:x', '3.84');
      vertices[0].setAttributeNS(sldNs, 'smth:y', '4.5');
      const corner = vertices[1].cloneNode() as Element;
      corner.setAttributeNS(sldNs, 'smth:x', '4.5');
      corner.setAttributeNS(sldNs, 'smth:y', '4.5');
      above.insertBefore(corner, vertices[1]);
      (q4.closest('ConductingEquipment')!.querySelector('Terminal')!).setAttribute('name', 'T1');
      resize(doc, [2, 3, 5, 1]);

      expectOrthogonal(doc);
      const [[q4x], [q2x]] = joins(doc, 'u4', 'u2');
      expect(q4x).to.equal(4.5);
      expect(q2x).to.not.equal(4.5);
    });
  });

  describe('turning', () => {
    it('routes all the feeders to the new line', () => {
      const doc = wired();
      resize(doc, [2, 3, 1, 4]);

      expectOrthogonal(doc);
      expect(buses(doc).flat().every(([x]) => x === 2.5)).to.be.true;
      joins(doc, 'u1', 'u2').forEach(([x, y]) => {
        expect(x).to.equal(2.5);
        expect(y).to.be.greaterThan(3.5);
        expect(y).to.be.lessThan(6.5);
      });
      // Each arrives sideways on the vertical bus bar.
      wires(doc).forEach((points) => {
        const [a, b] = points[0][0] === 2.5 ? points : [...points].reverse();
        expect(a[0]).to.equal(2.5);
        expect(b[1]).to.equal(a[1]);
      });
    });
  });
});
