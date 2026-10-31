import { expect } from '@open-wc/testing';
import { busSections, isBusBar, makeBusBar, connectivityPath, connectionStartPoints, } from './connectivity.js';
import { uniqueName, removeNode, removeTerminal, reparentElement, } from './connectivity-edits.js';
import { createSCLDoc } from '../test-helpers.js';
import { sclNs } from '../foundations.js';
describe('connectivity', () => {
    describe('busSections', () => {
        it('returns bus sections from an element', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="BB1">
              <ConnectivityNode name="L" pathName="S1/V1/BB1/L">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section smth:bus="true">
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                    <smth:Vertex smth:x="1.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(busSections(bay)).to.have.length(1);
        });
        it('returns empty array when no bus sections exist', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1">
              <ConnectivityNode name="L" pathName="S1/V1/B1/L">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(busSections(bay)).to.have.length(0);
        });
    });
    describe('isBusBar', () => {
        it('returns true for a Bay with bus sections', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="BB1">
              <ConnectivityNode name="L" pathName="S1/V1/BB1/L">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section smth:bus="true">
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(isBusBar(bay)).to.be.true;
        });
        it('returns false for a regular Bay', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1"/>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(isBusBar(bay)).to.be.false;
        });
        it('returns false for non-Bay elements', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const el = doc.querySelector('Substation');
            expect(isBusBar(el)).to.be.false;
        });
    });
    describe('makeBusBar', () => {
        it('creates a Bay element with busbar structure', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const busBar = makeBusBar(doc, 'smth');
            expect(busBar.tagName).to.equal('Bay');
            expect(busBar.getAttribute('name')).to.equal('BB1');
        });
        it('has a ConnectivityNode child', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const busBar = makeBusBar(doc, 'smth');
            const cNode = busBar.querySelector('ConnectivityNode');
            expect(cNode).to.not.be.null;
            expect(cNode.getAttribute('name')).to.equal('L');
        });
        it('has a bus section with two vertices', () => {
            const doc = createSCLDoc(`<Substation name="S1"/>`);
            const busBar = makeBusBar(doc, 'smth');
            expect(busSections(busBar)).to.have.length(1);
            const section = busSections(busBar)[0];
            expect(section.children).to.have.length(2);
        });
    });
    describe('connectivityPath', () => {
        it('builds path from element hierarchy', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1"/>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(connectivityPath(bay)).to.equal('S1/V1/B1');
        });
        it('appends additional path parts', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1"/>
          </VoltageLevel>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            expect(connectivityPath(bay, 'L1')).to.equal('S1/V1/B1/L1');
        });
    });
    describe('uniqueName', () => {
        it('keeps the original name when no conflict', () => {
            const doc = createSCLDoc(`
        <VoltageLevel name="V1">
          <Bay name="B1"/>
        </VoltageLevel>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const newBay = doc.createElementNS(sclNs, 'Bay');
            newBay.setAttribute('name', 'B2');
            expect(uniqueName(newBay, vl)).to.equal('B2');
        });
        it('generates a unique name when conflict exists', () => {
            const doc = createSCLDoc(`
        <VoltageLevel name="V1">
          <Bay name="B1"/>
          <Bay name="B2"/>
        </VoltageLevel>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const newBay = doc.createElementNS(sclNs, 'Bay');
            newBay.setAttribute('name', 'B1');
            expect(uniqueName(newBay, vl)).to.equal('B3');
        });
        it('uses tagName initial when element has no name', () => {
            const doc = createSCLDoc(`
        <VoltageLevel name="V1">
        </VoltageLevel>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const newBay = doc.createElementNS(sclNs, 'Bay');
            expect(uniqueName(newBay, vl)).to.equal('B1');
        });
    });
    describe('removeNode', () => {
        it('returns edit to remove a simple connectivity node', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1">
              <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const cNode = doc.querySelector('ConnectivityNode');
            const edits = removeNode(cNode);
            expect(edits.length).to.be.greaterThan(0);
            expect(edits[0].node).to.equal(cNode);
        });
        it('also removes terminals referencing the node', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1">
              <ConductingEquipment name="Q1">
                <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
              </ConductingEquipment>
              <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const cNode = doc.querySelector('ConnectivityNode');
            const edits = removeNode(cNode);
            const removedNodes = edits
                .filter((e) => 'node' in e && !('parent' in e))
                .map(e => e.node);
            const terminal = doc.querySelector('Terminal');
            expect(removedNodes).to.include(terminal);
        });
    });
    describe('connectionStartPoints', () => {
        it('returns T1 and T2 start points for rotation 0', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1">
              <ConductingEquipment name="Q1" type="CBR">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:SLDAttributes smth:x="5" smth:y="3" smth:w="1" smth:h="1"/>
                </Private>
              </ConductingEquipment>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const points = connectionStartPoints(eq);
            expect(points.T1).to.have.length(2);
            expect(points.T2).to.have.length(2);
            expect(points.T1[0]).to.deep.equal([5.5, 3.16]);
            expect(points.T1[1]).to.deep.equal([5.5, 3]);
        });
    });
    describe('reparentElement', () => {
        it('returns edits to move element to new parent', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1"/>
          </VoltageLevel>
          <VoltageLevel name="V2"/>
        </Substation>
      `);
            const bay = doc.querySelector('Bay');
            const vl2 = doc.querySelectorAll('VoltageLevel')[1];
            const edits = reparentElement(bay, vl2);
            expect(edits.length).to.be.greaterThan(0);
            const moveEdit = edits[0];
            expect(moveEdit.node).to.equal(bay);
            expect(moveEdit.parent).to.equal(vl2);
        });
    });
    describe('removeTerminal', () => {
        it('returns edit to remove the terminal', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Bay name="B1">
              <ConductingEquipment name="Q1">
                <Terminal name="T1" connectivityNode="S1/V1/B1/L1" substationName="S1" voltageLevelName="V1" bayName="B1" cNodeName="L1"/>
              </ConductingEquipment>
              <ConductingEquipment name="Q2">
                <Terminal name="T1" connectivityNode="S1/V1/B1/L1" substationName="S1" voltageLevelName="V1" bayName="B1" cNodeName="L1"/>
              </ConductingEquipment>
              <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
                <Private type="OpenSCD-SLD-Layout">
                  <smth:Section>
                    <smth:Vertex smth:x="0.5" smth:y="0.5"/>
                  </smth:Section>
                </Private>
              </ConnectivityNode>
            </Bay>
          </VoltageLevel>
        </Substation>
      `);
            const terminal = doc.querySelector('Terminal');
            const edits = removeTerminal(terminal);
            expect(edits.length).to.be.greaterThan(0);
            const firstEdit = edits[0];
            expect(firstEdit.node).to.equal(terminal);
        });
    });
});
//# sourceMappingURL=connectivity.spec.js.map