import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import { autoLayoutEdits, needsLayout } from './auto-layout.js';
import { connectionPointsAt } from './connectivity.js';
import { attributes, getSLDAttributes } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';

import type { Point } from './geometry.js';

const terminal = (name: string, bay: string, node: string) =>
  `<Terminal name="${name}" connectivityNode="S1/V1/${bay}/${node}"
    substationName="S1" voltageLevelName="V1" bayName="${bay}" cNodeName="${node}"/>`;

/** A feeder bay: a disconnector from the bus bar, a breaker, and an earth switch and a line disconnector below it. */
const feeder = (bay: string) => `
  <Bay name="${bay}">
    <ConductingEquipment name="QB1" type="DIS">
      ${terminal('T1', 'BB1', 'L1')}${terminal('T2', bay, 'L1')}
    </ConductingEquipment>
    <ConductingEquipment name="QA1" type="CBR">
      ${terminal('T1', bay, 'L1')}${terminal('T2', bay, 'L2')}
    </ConductingEquipment>
    <ConductingEquipment name="QC1" type="ERS">
      ${terminal('T1', bay, 'L2')}
    </ConductingEquipment>
    <ConductingEquipment name="QB9" type="DIS">
      ${terminal('T1', bay, 'L2')}
    </ConductingEquipment>
    <ConnectivityNode name="L1" pathName="S1/V1/${bay}/L1"/>
    <ConnectivityNode name="L2" pathName="S1/V1/${bay}/L2"/>
  </Bay>`;

function unplaced() {
  return createSCLDoc(`
    <Substation name="S1">
      <VoltageLevel name="V1">
        <Bay name="BB1">
          <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1"/>
        </Bay>
        ${feeder('Q01')}
        ${feeder('Q02')}
      </VoltageLevel>
    </Substation>`);
}

const rect = (element: Element) => {
  const {
    pos: [x, y],
    dim: [w, h],
  } = attributes(element);
  return [x, y, w, h];
};

const inside = (inner: Element, outer: Element) => {
  const [x, y, w, h] = rect(inner);
  const [ox, oy, ow, oh] = rect(outer);
  return x >= ox && y >= oy && x + w <= ox + ow && y + h <= oy + oh;
};

function polylines(node: Element): { points: Point[]; ids: (string | null)[] }[] {
  return Array.from(node.getElementsByTagNameNS(sldNs, 'Section')).map((section) => {
    const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
    return {
      points: vertices.map(v => attributes(v).pos),
      ids: vertices.map(v => getSLDAttributes(v, 'uuid')),
    };
  });
}

describe('auto layout', () => {
  let doc: XMLDocument;
  let substation: Element;

  beforeEach(() => {
    doc = unplaced();
    substation = doc.querySelector('Substation')!;
    handleEdit(autoLayoutEdits(substation, 'smth'));
  });

  it('is offered for a substation without any layout only', () => {
    const fresh = unplaced().querySelector('Substation')!;
    expect(needsLayout(fresh)).to.be.true;
    expect(needsLayout(substation)).to.be.false;
  });

  it('places everything inside what contains it', () => {
    const voltageLevel = doc.querySelector('VoltageLevel')!;
    expect(inside(voltageLevel, substation)).to.be.true;
    doc.querySelectorAll('Bay').forEach((bay) => {
      expect(inside(bay, voltageLevel), bay.getAttribute('name')!).to.be.true;
    });
    doc.querySelectorAll('ConductingEquipment').forEach((equipment) => {
      expect(inside(equipment, equipment.parentElement!)).to.be.true;
    });
  });

  it('keeps a free cell around every piece of equipment', () => {
    const cells = Array.from(doc.querySelectorAll('ConductingEquipment')).map(
      equipment => attributes(equipment).pos,
    );
    cells.forEach((a, i) =>
      cells.slice(i + 1).forEach((b) => {
        expect(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))).to.be.at.least(2);
      }),
    );
  });

  it('places equipment connected to each other close together', () => {
    const [qb1, qa1] = ['QB1', 'QA1'].map(
      name => attributes(doc.querySelector(`Bay[name="Q01"] > [name="${name}"]`)!).pos,
    );
    expect(qa1[0]).to.equal(qb1[0]);
    expect(qa1[1] - qb1[1]).to.equal(2);
  });

  it('turns a bay holding nothing but a node into a bus bar', () => {
    const bus = doc.querySelector('Bay[name="BB1"]')!;
    const [, y, w, h] = rect(bus);
    expect(h).to.equal(1);
    expect(w).to.be.greaterThan(1);
    const buses = Array.from(bus.getElementsByTagNameNS(sldNs, 'Section')).filter(
      section => getSLDAttributes(section, 'bus') === 'true',
    );
    // Cut where the two feeders join it.
    expect(buses).to.have.lengthOf(3);
    buses.forEach(section =>
      Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).forEach(v =>
        expect(attributes(v).pos[1]).to.equal(y + 0.5),
      ),
    );
  });

  it('draws every connection orthogonally and to its terminals', () => {
    doc.querySelectorAll('ConnectivityNode').forEach((node) => {
      const wires = polylines(node);
      wires.forEach(({ points }) =>
        points.slice(1).forEach(([x, y], i) => {
          expect(x === points[i][0] || y === points[i][1], `${points}`).to.be.true;
        }),
      );
      const pathName = node.getAttribute('pathName');
      doc.querySelectorAll(`Terminal[connectivityNode="${pathName}"]`).forEach((t) => {
        const id = getSLDAttributes(t, 'uuid');
        expect(id, `${pathName} ${t.parentElement!.getAttribute('name')}`).to.exist;
        const ends = wires.flatMap(({ points, ids }) =>
          points.filter((_, i) => ids[i] === id),
        );
        const equipment = t.parentElement!;
        const { pos, rot } = attributes(equipment);
        const [near] = connectionPointsAt(pos, rot)[t.getAttribute('name') as 'T1'];
        expect(ends).to.deep.include(near);
      });
    });
  });

  it('connects the wires of each node with each other', () => {
    doc.querySelectorAll('ConnectivityNode').forEach((node) => {
      const wires = polylines(node);
      const key = ([x, y]: Point) => `${x},${y}`;
      const groups = wires.map(({ points }) => new Set(points.map(key)));
      const reached = new Set([0]);
      for (let grown = true; grown; ) {
        grown = false;
        groups.forEach((group, i) => {
          if (
            !reached.has(i) &&
            [...reached].some(j => [...group].some(p => groups[j].has(p)))
          ) {
            reached.add(i);
            grown = true;
          }
        });
      }
      expect(reached.size, node.getAttribute('pathName')!).to.equal(wires.length);
    });
  });
});
