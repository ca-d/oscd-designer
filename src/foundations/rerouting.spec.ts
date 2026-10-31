import { expect } from '@open-wc/testing';
import { handleEdit } from '@omicronenergy/oscd-editor';

import { connectionPointsAt } from './connectivity.js';
import {
  createRotateEdits,
  shiftDescendantEdits,
  shiftElementEdits,
} from './edits.js';
import { planReroutes, rerouteEdits, sectionSignature, pointsSignature } from './rerouting.js';
import type { FlaggedSection } from './rerouting.js';
import { attributes, getSLDAttributes, setSLDAttributes } from './sld-attributes.js';
import { sldNs } from '../foundations.js';
import { createSCLDoc } from '../test-helpers.js';

import type { Point } from './geometry.js';

const layout = (attrs: string) =>
  `<Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes ${attrs}/></Private>`;

const terminal = (name: string, uuid: string, cNode = 'L1') =>
  `<Terminal name="${name}" connectivityNode="S1/V1/B1/${cNode}" substationName="S1"
     voltageLevelName="V1" bayName="B1" cNodeName="${cNode}">
     ${layout(`smth:uuid="${uuid}"`)}
   </Terminal>`;

const vertex = (x: number, y: number, uuid?: string) =>
  `<smth:Vertex smth:x="${x}" smth:y="${y}"${uuid ? ` smth:uuid="${uuid}"` : ''}/>`;

/** Two pieces of equipment in a bay wired together, plus whatever `extra` adds. */
function substation({
  wires = '',
  extra = '',
  second = '<ConductingEquipment name="Q2" type="DIS">',
  secondLayout = layout('smth:x="3" smth:y="8" smth:rot="0"'),
  secondTerminals = terminal('T1', 'u2'),
} = {}) {
  return createSCLDoc(`
    <Substation name="S1">
      ${layout('smth:w="50" smth:h="25"')}
      <VoltageLevel name="V1">
        ${layout('smth:x="1" smth:y="1" smth:w="40" smth:h="20" smth:lx="1" smth:ly="1"')}
        <Bay name="B1">
          ${layout('smth:x="2" smth:y="2" smth:w="30" smth:h="15" smth:lx="2" smth:ly="2"')}
          <ConductingEquipment name="Q1" type="CBR">
            ${layout('smth:x="3" smth:y="3" smth:rot="0"')}
            ${terminal('T2', 'u1')}
          </ConductingEquipment>
          ${second}
            ${secondLayout}
            ${secondTerminals}
          </ConductingEquipment>
          <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
            <Private type="OpenSCD-SLD-Layout">
              ${wires}
            </Private>
          </ConnectivityNode>
          ${extra}
        </Bay>
      </VoltageLevel>
    </Substation>`);
}

const straightWire = `<smth:Section>${vertex(3.5, 3.84, 'u1')}${vertex(3.5, 8.16, 'u2')}</smth:Section>`;

function sections(doc: XMLDocument): Element[] {
  return Array.from(doc.getElementsByTagNameNS(sldNs, 'Section'));
}

function polyline(section: Element): Point[] {
  return Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(
    v => attributes(v).pos,
  );
}

/** Every wire is orthogonal and ends exactly on the terminals it is attached to. */
function expectAttached(doc: XMLDocument) {
  sections(doc).forEach((section) => {
    const points = polyline(section);
    points.slice(1).forEach(([x, y], i) => {
      expect(x === points[i][0] || y === points[i][1], `${points}`).to.be.true;
    });
    Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).forEach(
      (v) => {
        const uuid = getSLDAttributes(v, 'uuid');
        if (!uuid) {
          return;
        }
        const attached = Array.from(
          doc.querySelectorAll('Terminal, NeutralPoint'),
        ).find(t => getSLDAttributes(t, 'uuid') === uuid)!;
        expect(attached, `terminal ${uuid}`).to.exist;
        const { pos, rot } = attributes(attached.parentElement!);
        const name = attached.getAttribute('name') as 'T1' | 'T2';
        const [x, y] = connectionPointsAt(pos, rot)[name][0];
        const [vx, vy] = attributes(v).pos;
        expect(vx).to.be.closeTo(x, 1e-9);
        expect(vy).to.be.closeTo(y, 1e-9);
      },
    );
  });
}

function moveEquipment(doc: XMLDocument, name: string, dx: number, dy: number) {
  const element = doc.querySelector(`ConductingEquipment[name="${name}"]`)!;
  const {
    pos: [x, y],
  } = attributes(element);
  handleEdit([
    ...shiftElementEdits(element, x + dx, y + dy, 'smth'),
    ...rerouteEdits(doc, { kind: 'move', element, dx, dy }, 'smth'),
  ]);
  return element;
}

describe('rerouteEdits', () => {
  describe('moving equipment', () => {
    it('does nothing when no terminal leaves its wire', () => {
      const doc = substation({ wires: straightWire });
      const element = doc.querySelector('[name="Q1"]')!;
      expect(
        rerouteEdits(doc, { kind: 'move', element, dx: 0, dy: 0 }, 'smth'),
      ).to.deep.equal([]);
    });

    it('keeps the connection and moves the wire with the terminal', () => {
      const doc = substation({ wires: straightWire });
      moveEquipment(doc, 'Q2', 4, 0);

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expect(sections(doc)).to.have.lengthOf(1);
      expectAttached(doc);
    });

    it('routes around other equipment', () => {
      const doc = substation({
        wires: straightWire,
        extra: `<ConductingEquipment name="Q3" type="DIS">
          ${layout('smth:x="3" smth:y="5" smth:rot="0"')}
        </ConductingEquipment>`,
      });
      // The wire ran straight through Q3; once Q2 moves it cannot any more.
      moveEquipment(doc, 'Q2', 0, 3);

      expectAttached(doc);
      const [section] = sections(doc);
      polyline(section)
        .slice(1)
        .forEach(([x, y], i) => {
          const [px, py] = polyline(section)[i];
          const crosses =
            Math.max(x, px) > 3 && Math.min(x, px) < 4 &&
            Math.max(y, py) > 5 && Math.min(y, py) < 6;
          expect(crosses, `${px},${py} ${x},${y}`).to.be.false;
        });
    });

    it('keeps the end of a wire on its junction and meets it as before', () => {
      const doc = substation({
        wires: `
          <smth:Section>${vertex(3.5, 3.84, 'u1')}${vertex(3.5, 9.5)}</smth:Section>
          <smth:Section smth:bus="true">${vertex(2.5, 9.5)}${vertex(3.5, 9.5)}</smth:Section>
          <smth:Section smth:bus="true">${vertex(3.5, 9.5)}${vertex(8.5, 9.5)}</smth:Section>`,
        second: '<ConductingEquipment name="Q2" type="DIS">',
        secondLayout: layout('smth:x="20" smth:y="12" smth:rot="0"'),
        secondTerminals: '',
      });
      moveEquipment(doc, 'Q1', 3, 0);

      expectAttached(doc);
      const feeder = polyline(sections(doc)[0]);
      expect(feeder[feeder.length - 1]).to.deep.equal([3.5, 9.5]);
      expect(feeder[feeder.length - 2][0]).to.equal(3.5);
      expect(polyline(sections(doc)[1])).to.deep.equal([[2.5, 9.5], [3.5, 9.5]]);
    });

    it('does not touch or overlap other wires', () => {
      const doc = substation({
        wires: `${straightWire}
          <smth:Section>${vertex(0.5, 5.5)}${vertex(8.5, 5.5)}</smth:Section>`,
      });
      moveEquipment(doc, 'Q2', 5, 0);

      expectAttached(doc);
      const feeder = polyline(sections(doc)[0]);
      feeder.forEach(([, y], i) => {
        if (i > 0 && y === 5.5 && feeder[i - 1][1] === 5.5) {
          throw new Error(`runs along the other wire: ${feeder}`);
        }
      });
    });

    it('leaves a terminal it cannot place alone', () => {
      const doc = substation({
        wires: straightWire,
        second: '<ConductingEquipment name="Q2" type="DIS">',
        secondTerminals: `<NeutralPoint name="N1" connectivityNode="S1/V1/B1/L1"
          cNodeName="L1">${layout('smth:uuid="u2"')}</NeutralPoint>`,
      });
      moveEquipment(doc, 'Q2', 4, 0);

      expect(doc.querySelectorAll('NeutralPoint')).to.have.lengthOf(1);
      expect(doc.querySelectorAll('[name="Q1"] > Terminal')).to.have.lengthOf(1);
    });

    /** Moves `name` and returns whether any wire had to go through other elements. */
    function movesCleanly(doc: XMLDocument, name: string, dx: number, dy: number) {
      const element = doc.querySelector(`[name="${name}"]`)!;
      const clean = planReroutes(doc, { kind: 'move', element, dx, dy }).every(
        route => !route.fallback,
      );
      moveEquipment(doc, name, dx, dy);
      return clean;
    }

    it('keeps a connection between flush equipment without going through anything', () => {
      const doc = substation({ wires: straightWire });
      // Flush against Q1 there is no room to leave either terminal straight.
      expect(movesCleanly(doc, 'Q2', 0, -4)).to.be.true;

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expectAttached(doc);
    });

    it('turns on the border to get out of a tight spot', () => {
      const doc = substation({
        wires: straightWire,
        extra: `<ConductingEquipment name="Q3" type="DIS">
          ${layout('smth:x="3" smth:y="4" smth:rot="0"')}
        </ConductingEquipment>`,
      });
      // Q3 sits right under Q1, so the wire has to leave Q1 sideways.
      expect(movesCleanly(doc, 'Q2', 5, 0)).to.be.true;

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expectAttached(doc);
      polyline(sections(doc)[0]).slice(1).forEach(([x, y], i) => {
        const [px, py] = polyline(sections(doc)[0])[i];
        const crosses =
          Math.max(x, px) > 3 && Math.min(x, px) < 4 &&
          Math.max(y, py) > 4 && Math.min(y, py) < 5;
        expect(crosses, `${px},${py} ${x},${y}`).to.be.false;
      });
    });

    it('does not go through anything when there is a clean route', () => {
      const doc = substation({ wires: straightWire });

      expect(movesCleanly(doc, 'Q2', 4, 0)).to.be.true;
    });
  });

  describe('planReroutes', () => {
    it('plans without changing the document', () => {
      const doc = substation({ wires: straightWire });
      const before = new XMLSerializer().serializeToString(doc);
      const q2 = doc.querySelector('[name="Q2"]')!;
      const plan = planReroutes(doc, {
        kind: 'move',
        element: q2,
        dx: 4,
        dy: 0,
      });

      expect(plan).to.have.lengthOf(1);
      expect(plan[0].fallback).to.be.false;
      expect(new XMLSerializer().serializeToString(doc)).to.equal(before);
    });

    it('describes the geometry the edits give the section', () => {
      const doc = substation({ wires: straightWire });
      const q2 = doc.querySelector('[name="Q2"]')!;
      const [route] = planReroutes(doc, {
        kind: 'move',
        element: q2,
        dx: 0,
        dy: -4,
      });
      moveEquipment(doc, 'Q2', 0, -4);

      expect(sectionSignature(route.section)).to.equal(
        pointsSignature(route.points),
      );
    });
  });

  describe('flagging fallbacks', () => {
    /** Q2 has a wire up to Q1 and one down to Q4; the given other wires run right across where Q2's terminals leave once it moves up. */
    function crossed(wires: [number, number][]) {
      const net = (name: string, section: string) =>
        `<ConnectivityNode name="${name}" pathName="S1/V1/B1/${name}">
          <Private type="OpenSCD-SLD-Layout">${section}</Private>
        </ConnectivityNode>`;
      return substation({
        wires: straightWire,
        secondTerminals: terminal('T1', 'u2') + terminal('T2', 'u3', 'L2'),
        extra:
          net(
            'L2',
            `<smth:Section>${vertex(3.5, 8.84, 'u3')}${vertex(3.5, 12.16, 'u4')}</smth:Section>`,
          ) +
          `<ConductingEquipment name="Q4" type="DIS">
            ${layout('smth:x="3" smth:y="12" smth:rot="0"')}
            ${terminal('T1', 'u4', 'L2')}
          </ConductingEquipment>` +
          wires
            .map(([y1, y2], i) =>
              net(
                `W${i}`,
                `<smth:Section>${vertex(3.5, y1)}${vertex(3.5, y2)}</smth:Section>`,
              ),
            )
            .join(''),
      });
    }

    const plan = (doc: XMLDocument) =>
      planReroutes(doc, {
        kind: 'move',
        element: doc.querySelector('[name="Q2"]')!,
        dx: 0,
        dy: -2,
      });

    it('reports a section that has to run through other elements', () => {
      const routes = plan(crossed([[4.4, 5.9]]));

      expect(routes.map(route => route.fallback)).to.deep.equal([true, false]);
    });

    it('reports every section that has to run through other elements', () => {
      const routes = plan(
        crossed([
          [4.4, 5.9],
          [7.1, 7.6],
        ]),
      );

      expect(routes.map(route => route.fallback)).to.deep.equal([true, true]);
    });
  });

  describe('wires left under moved equipment', () => {
    const across = (y: number) =>
      substation({
        extra: `<ConnectivityNode name="W" pathName="S1/V1/B1/W">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Section><smth:Vertex smth:x="5" smth:y="${y}"/><smth:Vertex smth:x="9" smth:y="${y}"/></smth:Section>
          </Private>
        </ConnectivityNode>`,
      });

    const flagged = (doc: XMLDocument, name: string, dx: number, dy: number) => {
      const fallbacks: FlaggedSection[] = [];
      rerouteEdits(
        doc,
        { kind: 'move', element: doc.querySelector(`[name="${name}"]`)!, dx, dy },
        'smth',
        fallbacks,
      );
      return fallbacks.map(({ section }) => section);
    };

    it('flags a wire that runs through the equipment moved onto it', () => {
      const doc = across(12.5);

      expect(flagged(doc, 'Q2', 4, 4)).to.deep.equal([sections(doc)[0]]);
    });

    it('does not flag a wire that only touches the equipment', () => {
      const doc = across(12);

      expect(flagged(doc, 'Q2', 4, 4)).to.deep.equal([]);
    });

    it('does not flag wires the move left alone', () => {
      const doc = across(5.5);

      expect(flagged(doc, 'Q2', 0, 0)).to.deep.equal([]);
    });
  });

  describe('rotating equipment', () => {
    it('keeps the connection and reattaches the wire', () => {
      const doc = substation({ wires: straightWire });
      const q1 = doc.querySelector('[name="Q1"]')!;
      handleEdit(createRotateEdits(q1, 'smth'));

      expect(attributes(q1).rot).to.equal(1);
      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expectAttached(doc);
    });

    it('keeps every connection through repeated turns', () => {
      const doc = substation({ wires: straightWire });
      const q2 = doc.querySelector('[name="Q2"]')!;
      for (let turn = 0; turn < 4; turn += 1) {
        handleEdit(createRotateEdits(q2, 'smth'));
        expect(doc.querySelectorAll('Terminal'), `turn ${turn}`).to.have.lengthOf(2);
        expectAttached(doc);
      }
    });
  });

  describe('moving a container', () => {
    function twoBays() {
      const doc = createSCLDoc(`
        <Substation name="S1">
          ${layout('smth:w="50" smth:h="25"')}
          <VoltageLevel name="V1">
            ${layout('smth:x="1" smth:y="1" smth:w="40" smth:h="20" smth:lx="1" smth:ly="1"')}
            <Bay name="B1">
              ${layout('smth:x="2" smth:y="2" smth:w="6" smth:h="6" smth:lx="2" smth:ly="2"')}
              <ConductingEquipment name="Q1" type="CBR">
                ${layout('smth:x="3" smth:y="3" smth:rot="1"')}
                ${terminal('T1', 'u1')}
              </ConductingEquipment>
              <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>${vertex(3.84, 3.5, 'u1')}${vertex(12.16, 3.5, 'u2')}</smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
            <Bay name="B2">
              ${layout('smth:x="11" smth:y="2" smth:w="6" smth:h="6" smth:lx="11" smth:ly="2"')}
              <ConductingEquipment name="Q2" type="DIS">
                ${layout('smth:x="12" smth:y="3" smth:rot="1"')}
                ${terminal('T2', 'u2')}
              </ConductingEquipment>
            </Bay>
          </VoltageLevel>
        </Substation>`);
      return doc;
    }

    function moveBay(doc: XMLDocument, name: string, dx: number, dy: number) {
      const bay = doc.querySelector(`Bay[name="${name}"]`)!;
      const {
        pos: [x, y],
      } = attributes(bay);
      handleEdit([
        ...shiftElementEdits(bay, x + dx, y + dy, 'smth'),
        ...shiftDescendantEdits(bay, dx, dy, 'smth'),
        ...rerouteEdits(doc, { kind: 'move', element: bay, dx, dy }, 'smth'),
      ]);
    }

    it('keeps connections to equipment outside the container', () => {
      const doc = twoBays();
      moveBay(doc, 'B2', 0, 5);

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expectAttached(doc);
    });

    it('keeps connections of a container whose wires live outside it', () => {
      const doc = twoBays();
      moveBay(doc, 'B1', 0, 4);

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(2);
      expectAttached(doc);
    });

    it('reroutes several wires of one node that meet in a junction', () => {
      const doc = createSCLDoc(`
        <Substation name="S1">
          ${layout('smth:w="50" smth:h="25"')}
          <VoltageLevel name="V1">
            ${layout('smth:x="1" smth:y="1" smth:w="40" smth:h="20" smth:lx="1" smth:ly="1"')}
            <Bay name="B1">
              ${layout('smth:x="2" smth:y="3" smth:w="16" smth:h="4" smth:lx="2" smth:ly="3"')}
              <ConductingEquipment name="Q1" type="CBR">
                ${layout('smth:x="4" smth:y="4" smth:rot="1"')}
                ${terminal('T1', 'u1')}
              </ConductingEquipment>
              <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>${vertex(4.84, 4.5, 'u1')}${vertex(16.5, 4.5)}</smth:Section>
                  <smth:Section>${vertex(17.16, 5.5, 'u2')}${vertex(16.5, 5.5)}${vertex(16.5, 4.5)}</smth:Section>
                  <smth:Section>${vertex(16.5, 4.5)}${vertex(18.16, 4.5, 'u3')}</smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
            <Bay name="B2">
              ${layout('smth:x="17" smth:y="3" smth:w="4" smth:h="4" smth:lx="17" smth:ly="3"')}
              <ConductingEquipment name="Q2" type="CTR">
                ${layout('smth:x="17" smth:y="5" smth:rot="3"')}
                ${terminal('T1', 'u2')}
              </ConductingEquipment>
              <ConductingEquipment name="Q3" type="DIS">
                ${layout('smth:x="18" smth:y="4" smth:rot="1"')}
                ${terminal('T2', 'u3')}
              </ConductingEquipment>
            </Bay>
          </VoltageLevel>
        </Substation>`);
      const bay = doc.querySelector('Bay[name="B1"]')!;
      handleEdit([
        ...shiftElementEdits(bay, 2, 2, 'smth'),
        ...shiftDescendantEdits(bay, 0, -1, 'smth'),
        ...rerouteEdits(doc, { kind: 'move', element: bay, dx: 0, dy: -1 }, 'smth'),
      ]);

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(3);
      expect(sections(doc)).to.have.lengthOf(3);
      expectAttached(doc);
    });

    it('leaves connections that move along with their container alone', () => {
      const doc = twoBays();
      const before = polyline(sections(doc)[0]);
      // Both ends move together only if the wire's whole net is inside.
      const bay = doc.querySelector('Bay[name="B1"]')!;
      const edits = rerouteEdits(
        doc,
        { kind: 'move', element: bay.closest('VoltageLevel')!, dx: 2, dy: 1 },
        'smth',
      );
      expect(edits).to.deep.equal([]);
      expect(polyline(sections(doc)[0])).to.deep.equal(before);
    });
  });

  describe('power transformers', () => {
    function withTransformer() {
      return substation({
        wires: `<smth:Section>${vertex(10.5, 6.84, 'u2')}${vertex(10.5, 9.3, 'u3')}</smth:Section>`,
        second: `<ConductingEquipment name="Q2" type="DIS">`,
        secondLayout: layout('smth:x="10" smth:y="6" smth:rot="0"'),
        secondTerminals: terminal('T2', 'u2'),
        extra: `<PowerTransformer name="TR1" type="PTR">
          ${layout('smth:x="10" smth:y="10" smth:rot="0"')}
          <TransformerWinding name="W1" type="PTW">
            ${terminal('T1', 'u3')}
          </TransformerWinding>
        </PowerTransformer>`,
      });
    }

    function firstVertex(doc: XMLDocument) {
      return polyline(sections(doc)[0])[0];
    }

    it('keeps a transformer connected when it moves', () => {
      const doc = withTransformer();
      const transformer = doc.querySelector('PowerTransformer')!;
      handleEdit([
        ...shiftElementEdits(transformer, 13, 10, 'smth'),
        ...rerouteEdits(
          doc,
          { kind: 'move', element: transformer, dx: 3, dy: 0 },
          'smth',
        ),
      ]);

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(3);
      const [x, y] = polyline(sections(doc)[0]).pop()!;
      expect(x).to.be.closeTo(13.5, 1e-9);
      expect(y).to.be.closeTo(9.3, 1e-9);
      polyline(sections(doc)[0])
        .slice(1)
        .forEach(([px, py], i) => {
          const [qx, qy] = polyline(sections(doc)[0])[i];
          expect(px === qx || py === qy).to.be.true;
        });
    });

    it('keeps a transformer connected when it turns', () => {
      const doc = withTransformer();
      const transformer = doc.querySelector('PowerTransformer')!;
      handleEdit(createRotateEdits(transformer, 'smth'));

      expect(doc.querySelectorAll('Terminal')).to.have.lengthOf(3);
      expect(attributes(transformer).rot).to.equal(1);
      const points = polyline(sections(doc)[0]);
      const [x, y] = points[points.length - 1];
      expect(x).to.be.closeTo(11.7, 1e-9);
      expect(y).to.be.closeTo(10.5, 1e-9);
      points.slice(1).forEach(([px, py], i) => {
        expect(px === points[i][0] || py === points[i][1]).to.be.true;
      });
      expect(firstVertex(doc)).to.deep.equal([10.5, 6.84]);
    });
  });

  it('ignores elements that are not in the document', () => {
    const doc = substation({ wires: straightWire });
    const detached = doc.querySelector('[name="Q1"]')!.cloneNode(true) as Element;
    setSLDAttributes(detached, 'smth', { x: '9' });
    expect(
      rerouteEdits(doc, { kind: 'move', element: detached, dx: 1, dy: 0 }, 'smth'),
    ).to.deep.equal([]);
  });
});
