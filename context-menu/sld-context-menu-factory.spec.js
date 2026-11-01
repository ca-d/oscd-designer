import { expect } from '@open-wc/testing';
import { createContextMenuItems } from './sld-context-menu-factory.js';
import { createSCLDoc, sldFixture } from '../test-helpers.js';
import { attributes } from '../foundations/sld-attributes.js';
import { sldNs } from '../foundations.js';
function actions(items) {
    return items.filter((i) => !('type' in i) || i.type === 'action');
}
function headlines(items) {
    return actions(items).map(i => i.headline);
}
/**
 * Builds the menu for `element` with a capturing dispatch, invokes the handler
 * of the action whose headline matches, and returns the events it dispatched.
 */
function invoke(element, headline, overrides = {}) {
    const dispatched = [];
    const ctx = makeContext(element, {
        dispatch: e => dispatched.push(e),
        ...overrides,
    });
    const action = actions(createContextMenuItems(ctx)).find(i => i.headline === headline);
    if (!action) {
        throw new Error(`no menu action "${headline}"`);
    }
    action.handler();
    return dispatched;
}
/**
 * Reduces a dispatched event to a stable "signature" the map below asserts on.
 * Interaction intents all share the `oscd-sld-start-interaction` type and are
 * only distinguished by their `mode`, so fold the mode into the signature.
 */
function signature(event) {
    const custom = event;
    if (custom.type === 'oscd-sld-start-interaction') {
        return `${custom.type}/${custom.detail.mode}`;
    }
    return custom.type;
}
/**
 * The finite contract of the context menu: every menu-item headline maps to the
 * signature of the single event its handler must dispatch. This is the source
 * of truth `expectHandlerSignatures` iterates over — a handler firing the wrong
 * event (or a new item added without an entry here) fails the suite.
 *
 * Context-dependent labels are handled by per-call `extra` overrides:
 * IED `Edit` dispatches `oscd-sld-edit-ied`, and Text `Move` moves the label
 * (`placingLabel`) rather than the element (`placing`).
 */
const EXPECTED_SIGNATURE = {
    // interaction intents (oscd-sld-start-interaction, distinguished by mode)
    Copy: 'oscd-sld-start-interaction/placing',
    Move: 'oscd-sld-start-interaction/placing',
    'Move Label': 'oscd-sld-start-interaction/placingLabel',
    Resize: 'oscd-sld-start-interaction/resizingBR',
    'Connect top': 'oscd-sld-start-interaction/connecting',
    'Connect right': 'oscd-sld-start-interaction/connecting',
    'Connect bottom': 'oscd-sld-start-interaction/connecting',
    'Connect left': 'oscd-sld-start-interaction/connecting',
    // document edits (oscd-edit-v2)
    Mirror: 'oscd-edit-v2',
    Delete: 'oscd-edit-v2',
    'Add Text': 'oscd-edit-v2',
    'Remove Text': 'oscd-edit-v2',
    'Delete Text': 'oscd-edit-v2',
    'Detach top': 'oscd-edit-v2',
    'Detach right': 'oscd-edit-v2',
    'Detach bottom': 'oscd-edit-v2',
    'Detach left': 'oscd-edit-v2',
    'Detach Terminal': 'oscd-edit-v2',
    'Detach Terminals': 'oscd-edit-v2',
    'Detach Neutral Point': 'oscd-edit-v2',
    'Add Tap Changer': 'oscd-edit-v2',
    'Remove Tap Changer': 'oscd-edit-v2',
    'Ground top': 'oscd-edit-v2',
    'Ground right': 'oscd-edit-v2',
    'Ground bottom': 'oscd-edit-v2',
    'Ground left': 'oscd-edit-v2',
    Bold: 'oscd-edit-v2',
    'Remove Formatting': 'oscd-edit-v2',
    Red: 'oscd-edit-v2',
    Blue: 'oscd-edit-v2',
    'Reset Color': 'oscd-edit-v2',
    'Delete IED': 'oscd-edit-v2',
    'Remove from SLD': 'oscd-edit-v2',
    // SCL edit dialog (oscd-sld-edit-scl)
    Edit: 'oscd-sld-edit-scl',
    'Edit Winding': 'oscd-sld-edit-scl',
    'Edit Tap Changer': 'oscd-sld-edit-scl',
    // rotation (oscd-sld-rotate)
    Rotate: 'oscd-sld-rotate',
};
/**
 * Exhaustively asserts that every action in the built menu dispatches exactly
 * one event whose signature matches {@link EXPECTED_SIGNATURE} (merged with any
 * `extra` overrides). Fails on an unmapped item, a silent no-op, or a wrong
 * event — replacing the old "dispatches at least one event" smoke check.
 */
function expectHandlerSignatures(element, overrides = {}, extra = {}) {
    const map = { ...EXPECTED_SIGNATURE, ...extra };
    const labels = headlines(createContextMenuItems(makeContext(element, overrides)));
    expect(labels.length, 'menu produced no action items').to.be.greaterThan(0);
    labels.forEach((label) => {
        expect(map[label], `no expected signature mapped for menu item "${label}"`)
            .to.be.a('string');
        const events = invoke(element, label, overrides);
        expect(events.length, `handler "${label}" dispatched wrong event count`)
            .to.equal(1);
        expect(signature(events[0]), `handler "${label}" dispatched wrong event`)
            .to.equal(map[label]);
    });
}
function makeContext(element, overrides = {}) {
    return {
        element,
        x: 100,
        y: 100,
        gridX: 5,
        gridY: 5,
        doc: element.ownerDocument,
        nsp: 'smth',
        dispatch: () => { },
        ...overrides,
    };
}
function bayDoc(children = '', bayName = 'B1') {
    return sldFixture({ children, bayName });
}
describe('sld-context-menu-factory', () => {
    describe('ConductingEquipment', () => {
        it('returns standard equipment menu items', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            const labels = headlines(items);
            expect(labels).to.include('Mirror');
            expect(labels).to.include('Rotate');
            expect(labels).to.include('Copy');
            expect(labels).to.include('Move');
            expect(labels).to.include('Move Label');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete');
        });
        it('includes connect options when no terminal connected', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            const labels = headlines(items);
            expect(labels.some(l => l.startsWith('Connect'))).to.be.true;
            expect(labels.some(l => l.startsWith('Ground'))).to.be.true;
        });
        it('includes disconnect when terminal is present', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
        </ConductingEquipment>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            const labels = headlines(items);
            expect(labels.some(l => l.startsWith('Detach'))).to.be.true;
        });
        it('offers Add Text when no Text child exists', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            expect(headlines(items)).to.include('Add Text');
        });
        it('offers Remove Text when Text child exists', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>Label</Text>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            expect(headlines(items)).to.include('Remove Text');
        });
        it('does not offer bottom connect for single-terminal equipment', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="G1" type="GEN">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const items = createContextMenuItems(makeContext(eq));
            const labels = headlines(items);
            const connectLabels = labels.filter(l => l.startsWith('Connect'));
            // Single-terminal (GEN): only top connect, no bottom
            expect(connectLabels.length).to.equal(1);
        });
        it('dispatches the correct event from every action handler', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>Label</Text>
          <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
        </ConductingEquipment>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            expectHandlerSignatures(eq);
        });
        it('Copy dispatches a copy placement intent', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
        </ConductingEquipment>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const [event] = invoke(eq, 'Copy');
            expect(event.type).to.equal('oscd-sld-start-interaction');
            expect(event.detail).to.deep.include({
                mode: 'placing',
                element: eq,
                copy: true,
            });
        });
        it('a ground handler with no containing bay emits a ground hint', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <ConductingEquipment name="Q1" type="CBR">
              <Private type="OpenSCD-SLD-Layout">
                <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
              </Private>
            </ConductingEquipment>
          </VoltageLevel>
        </Substation>
      `);
            const eq = doc.querySelector('ConductingEquipment');
            const ground = headlines(createContextMenuItems(makeContext(eq))).find(l => l.startsWith('Ground'));
            const [event] = invoke(eq, ground);
            expect(event.type).to.equal('oscd-sld-ground-hint');
        });
    });
    describe('PowerTransformer', () => {
        it('returns standard transformer menu items', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const pt = doc.querySelector('PowerTransformer');
            const items = createContextMenuItems(makeContext(pt));
            const labels = headlines(items);
            expect(labels).to.include('Rotate');
            expect(labels).to.include('Copy');
            expect(labels).to.include('Move');
            expect(labels).to.include('Move Label');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete');
        });
        it('includes Mirror for auto kind', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:kind="auto"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const pt = doc.querySelector('PowerTransformer');
            const items = createContextMenuItems(makeContext(pt));
            expect(headlines(items)).to.include('Mirror');
        });
        it('includes Mirror for earthing kind with 2 windings', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:kind="earthing"/>
          </Private>
          <TransformerWinding name="W1"/>
          <TransformerWinding name="W2"/>
        </PowerTransformer>
      `);
            const pt = doc.querySelector('PowerTransformer');
            const items = createContextMenuItems(makeContext(pt));
            expect(headlines(items)).to.include('Mirror');
        });
        it('excludes Mirror for default kind', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const pt = doc.querySelector('PowerTransformer');
            const items = createContextMenuItems(makeContext(pt));
            expect(headlines(items)).to.not.include('Mirror');
        });
        it('dispatches the correct event from every action handler', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:kind="auto"/>
          </Private>
          <Text>Label</Text>
          <TransformerWinding name="W1">
            <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
            <NeutralPoint name="N1" connectivityNode="S1/V1/B1/N"/>
          </TransformerWinding>
        </PowerTransformer>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
        <ConnectivityNode name="N" pathName="S1/V1/B1/N"/>
      `);
            const pt = doc.querySelector('PowerTransformer');
            expectHandlerSignatures(pt, {}, { Mirror: 'oscd-sld-flip' });
        });
        it('Copy dispatches a copy placement intent with offset', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const pt = doc.querySelector('PowerTransformer');
            const [event] = invoke(pt, 'Copy');
            expect(event.type).to.equal('oscd-sld-start-interaction');
            expect(event.detail.mode).to.equal('placing');
            expect(event.detail.copy).to.be.true;
            expect(event.detail.offset).to.be.an('array');
        });
    });
    describe('TransformerWinding', () => {
        it('returns winding items followed by transformer items', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1">
            <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
          </TransformerWinding>
        </PowerTransformer>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
      `);
            const winding = doc.querySelector('TransformerWinding');
            const items = createContextMenuItems(makeContext(winding));
            const labels = headlines(items);
            expect(labels).to.include('Detach Terminal');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Rotate');
        });
        it('includes Add Tap Changer when none exists', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const winding = doc.querySelector('TransformerWinding');
            const items = createContextMenuItems(makeContext(winding));
            expect(headlines(items)).to.include('Add Tap Changer');
        });
        it('includes Remove/Edit Tap Changer when one exists', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1">
            <TapChanger name="LTC" type="LTC"/>
          </TransformerWinding>
        </PowerTransformer>
      `);
            const winding = doc.querySelector('TransformerWinding');
            const items = createContextMenuItems(makeContext(winding));
            const labels = headlines(items);
            expect(labels).to.include('Remove Tap Changer');
            expect(labels).to.include('Edit Tap Changer');
            expect(labels).to.not.include('Add Tap Changer');
        });
        it('includes Detach Neutral Point when present', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1">
            <NeutralPoint name="N1" connectivityNode="S1/V1/B1/L1"/>
          </TransformerWinding>
        </PowerTransformer>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
      `);
            const winding = doc.querySelector('TransformerWinding');
            const items = createContextMenuItems(makeContext(winding));
            expect(headlines(items)).to.include('Detach Neutral Point');
        });
        it('dispatches the correct event from every action handler (with tap changer + terminals)', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1">
            <TapChanger name="LTC" type="LTC"/>
            <Terminal name="T1" connectivityNode="S1/V1/B1/L1"/>
            <NeutralPoint name="N1" connectivityNode="S1/V1/B1/N"/>
          </TransformerWinding>
        </PowerTransformer>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1"/>
        <ConnectivityNode name="N" pathName="S1/V1/B1/N"/>
      `);
            const winding = doc.querySelector('TransformerWinding');
            expectHandlerSignatures(winding);
        });
        it('dispatches the correct event from every action handler (add tap changer path)', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const winding = doc.querySelector('TransformerWinding');
            expectHandlerSignatures(winding);
        });
        it('Add Tap Changer inserts a TapChanger node', () => {
            const doc = bayDoc(`
        <PowerTransformer name="T1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <TransformerWinding name="W1"/>
        </PowerTransformer>
      `);
            const winding = doc.querySelector('TransformerWinding');
            const [event] = invoke(winding, 'Add Tap Changer');
            expect(event.type).to.equal('oscd-edit-v2');
            const insert = event.detail.edit;
            expect(insert.node.tagName).to.equal('TapChanger');
        });
    });
    describe('plain wire', () => {
        const terminal = (name, uuid) => `<Terminal name="${name}" connectivityNode="S1/V1/B1/L1" cNodeName="L1">
        <Private type="OpenSCD-SLD-Layout"><smth:SLDAttributes smth:uuid="${uuid}"/></Private>
      </Terminal>`;
        function wiredDoc() {
            return bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">${terminal('T2', 'u1')}</ConductingEquipment>
        <ConductingEquipment name="Q2" type="DIS">${terminal('T1', 'u2')}</ConductingEquipment>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Section>
              <smth:Vertex smth:x="3.5" smth:y="3.84" smth:uuid="u1"/>
              <smth:Vertex smth:x="3.5" smth:y="5.16" smth:uuid="u2"/>
            </smth:Section>
          </Private>
        </ConnectivityNode>
      `);
        }
        it('offers to disconnect each piece of equipment and to re-route the wire', () => {
            const doc = wiredDoc();
            const section = doc.getElementsByTagNameNS(sldNs, 'Section')[0];
            const items = createContextMenuItems(makeContext(section));
            expect(items[0]).to.deep.equal({
                type: 'header',
                element: doc.querySelector('ConnectivityNode'),
            });
            expect(headlines(items)).to.deep.equal([
                'Disconnect Q1',
                'Disconnect Q2',
                'Re-route',
            ]);
        });
        it('dispatches the correct event from every action handler', () => {
            const section = wiredDoc().getElementsByTagNameNS(sldNs, 'Section')[0];
            expectHandlerSignatures(section, {}, {
                'Disconnect Q1': 'oscd-edit-v2',
                'Disconnect Q2': 'oscd-edit-v2',
                'Re-route': 'oscd-sld-start-interaction/reroutingSection',
            });
        });
        it('disconnects the equipment by removing its terminal', () => {
            const doc = wiredDoc();
            const section = doc.getElementsByTagNameNS(sldNs, 'Section')[0];
            const [event] = invoke(section, 'Disconnect Q2');
            const edits = [event.detail.edit].flat(Infinity);
            expect(edits.some(edit => edit.node === doc.querySelector('[name="Q2"] > Terminal'))).to.be.true;
        });
        it('tells the terminals of one piece of equipment apart', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">${terminal('T1', 'u1')}${terminal('T2', 'u2')}</ConductingEquipment>
        <ConnectivityNode name="L1" pathName="S1/V1/B1/L1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:Section>
              <smth:Vertex smth:x="3.5" smth:y="3.16" smth:uuid="u1"/>
              <smth:Vertex smth:x="3.5" smth:y="3.84" smth:uuid="u2"/>
            </smth:Section>
          </Private>
        </ConnectivityNode>
      `);
            const section = doc.getElementsByTagNameNS(sldNs, 'Section')[0];
            expect(headlines(createContextMenuItems(makeContext(section)))).to.deep.equal([
                'Disconnect Q1 (T1)',
                'Disconnect Q1 (T2)',
                'Re-route',
            ]);
        });
    });
    describe('Bay (busbar)', () => {
        it('returns busbar menu items', () => {
            const doc = bayDoc(`
          <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:Section smth:bus="true">
                <smth:Vertex smth:x="1" smth:y="1"/>
                <smth:Vertex smth:x="5" smth:y="1"/>
              </smth:Section>
            </Private>
          </ConnectivityNode>
        `, 'BB1');
            const bay = doc.querySelector('Bay');
            const items = createContextMenuItems(makeContext(bay));
            const labels = headlines(items);
            expect(labels).to.include('Resize');
            expect(labels).to.include('Move');
            expect(labels).to.include('Move Label');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete');
            expect(labels).to.not.include('Copy');
        });
        it('dispatches the correct event from every action handler', () => {
            const doc = bayDoc(`
          <Text>Bus</Text>
          <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:Section smth:bus="true">
                <smth:Vertex smth:x="1" smth:y="1"/>
                <smth:Vertex smth:x="5" smth:y="1"/>
              </smth:Section>
            </Private>
          </ConnectivityNode>
        `, 'BB1');
            const bay = doc.querySelector('Bay');
            expectHandlerSignatures(bay, { gridX: 50, gridY: 50 });
        });
        it('resizes the end of the bus bar nearest to where the menu was opened', () => {
            const doc = bayDoc(`
          <ConnectivityNode name="L1" pathName="S1/V1/BB1/L1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:Section smth:bus="true">
                <smth:Vertex smth:x="1.5" smth:y="1.5"/>
                <smth:Vertex smth:x="5.5" smth:y="1.5"/>
              </smth:Section>
            </Private>
          </ConnectivityNode>
        `, 'BB1');
            const bay = doc.querySelector('Bay');
            const { pos: [x, y], } = attributes(bay);
            const modeAt = (gridX, gridY) => signature(invoke(bay, 'Resize', { gridX, gridY })[0]);
            expect(modeAt(x, y)).to.equal('oscd-sld-start-interaction/resizingTL');
            expect(modeAt(x + 40, y)).to.equal('oscd-sld-start-interaction/resizingBR');
        });
    });
    describe('Substation', () => {
        const substation = () => createSCLDoc(`<Substation name="S1"/>`).querySelector('Substation');
        it('returns the commands of the substation header', () => {
            expect(headlines(createContextMenuItems(makeContext(substation())))).to.deep.equal([
                'Edit',
                'Resize',
                'Download SVG',
                'Delete',
            ]);
        });
        it('dispatches the correct event from every action handler', () => {
            expectHandlerSignatures(substation(), {}, {
                Resize: 'oscd-sld-substation-resize',
                'Download SVG': 'oscd-sld-substation-export',
                Delete: 'oscd-sld-substation-delete',
            });
        });
    });
    describe('Bay / VoltageLevel (container)', () => {
        it('returns container menu items for Bay', () => {
            const doc = bayDoc();
            const bay = doc.querySelector('Bay');
            const items = createContextMenuItems(makeContext(bay));
            const labels = headlines(items);
            expect(labels).to.include('Resize');
            expect(labels).to.include('Copy');
            expect(labels).to.include('Move');
            expect(labels).to.include('Move Label');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete');
        });
        it('returns container menu items for VoltageLevel', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="20" smth:h="15"/>
            </Private>
          </VoltageLevel>
        </Substation>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const items = createContextMenuItems(makeContext(vl));
            const labels = headlines(items);
            expect(labels).to.include('Resize');
            expect(labels).to.include('Copy');
            expect(labels).to.include('Move');
            expect(labels).to.include('Delete');
        });
        it('dispatches the correct event from every action handler', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="20" smth:h="15"/>
            </Private>
            <Text>VL</Text>
          </VoltageLevel>
        </Substation>
      `);
            const vl = doc.querySelector('VoltageLevel');
            expectHandlerSignatures(vl);
        });
        it('Copy dispatches a copy placement intent with offset', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <VoltageLevel name="V1">
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="1" smth:y="1" smth:w="20" smth:h="15"/>
            </Private>
          </VoltageLevel>
        </Substation>
      `);
            const vl = doc.querySelector('VoltageLevel');
            const [event] = invoke(vl, 'Copy');
            expect(event.type).to.equal('oscd-sld-start-interaction');
            expect(event.detail.copy).to.be.true;
            expect(event.detail.offset).to.be.an('array');
        });
    });
    describe('IED reference', () => {
        it('returns IED menu items', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
            <smth:Reference smth:type="IED" smth:id="IED1" smth:iedName="IED1">
              <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="1" smth:h="1"/>
            </smth:Reference>
          </Private>
        </Substation>
        <IED name="IED1"/>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const items = createContextMenuItems(makeContext(ref));
            const labels = headlines(items);
            expect(labels).to.include('Move');
            expect(labels).to.include('Move Label');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete IED');
            expect(labels).to.include('Remove from SLD');
        });
        it('excludes Edit and Delete IED when IED is unresolved', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
            <smth:Reference smth:type="IED" smth:id="MISSING" smth:iedName="MISSING">
              <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="1" smth:h="1"/>
            </smth:Reference>
          </Private>
        </Substation>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            const items = createContextMenuItems(makeContext(ref));
            const labels = headlines(items);
            expect(labels).to.include('Move');
            expect(labels).to.include('Remove from SLD');
            expect(labels).to.not.include('Edit');
            expect(labels).to.not.include('Delete IED');
        });
        it('dispatches the correct event from every action handler', () => {
            const doc = createSCLDoc(`
        <Substation name="S1">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="0" smth:y="0" smth:w="50" smth:h="25"/>
            <smth:Reference smth:type="IED" smth:id="IED1" smth:iedName="IED1">
              <smth:SLDAttributes smth:x="5" smth:y="5" smth:w="1" smth:h="1"/>
            </smth:Reference>
          </Private>
        </Substation>
        <IED name="IED1"/>
      `);
            const ref = doc.getElementsByTagNameNS(sldNs, 'Reference')[0];
            // An IED's "Edit" opens the IED editor, not the generic SCL edit dialog.
            expectHandlerSignatures(ref, {}, { Edit: 'oscd-sld-edit-ied' });
        });
    });
    describe('Text', () => {
        it('returns text menu items', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>Label</Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            const items = createContextMenuItems(makeContext(text));
            const labels = headlines(items);
            expect(labels).to.include('Rotate');
            expect(labels).to.include('Move');
            expect(labels).to.include('Edit');
            expect(labels).to.include('Delete');
        });
        it('includes color options when not already that color', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            const items = createContextMenuItems(makeContext(text));
            const labels = headlines(items);
            expect(labels).to.include('Red');
            expect(labels).to.include('Blue');
            expect(labels).to.not.include('Reset Color');
        });
        it('includes Reset Color when color is set', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:color="#BB1326"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            const items = createContextMenuItems(makeContext(text));
            const labels = headlines(items);
            expect(labels).to.include('Reset Color');
            expect(labels).to.not.include('Red');
            expect(labels).to.include('Blue');
        });
        it('includes Bold when weight is not 500', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            const items = createContextMenuItems(makeContext(text));
            const labels = headlines(items);
            expect(labels).to.include('Bold');
            expect(labels).to.not.include('Remove Formatting');
        });
        it('includes Remove Formatting when weight is 500', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:weight="500"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            const items = createContextMenuItems(makeContext(text));
            const labels = headlines(items);
            expect(labels).to.include('Remove Formatting');
            expect(labels).to.not.include('Bold');
        });
        it('dispatches the correct event from every action handler (default weight/color)', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            // A Text element's "Move" repositions the label itself (placingLabel).
            expectHandlerSignatures(text, {}, {
                Move: 'oscd-sld-start-interaction/placingLabel',
            });
        });
        it('dispatches the correct event from every action handler (bold + coloured)', () => {
            const doc = bayDoc(`
        <ConductingEquipment name="Q1" type="CBR">
          <Private type="OpenSCD-SLD-Layout">
            <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1"/>
          </Private>
          <Text>
            <Private type="OpenSCD-SLD-Layout">
              <smth:SLDAttributes smth:x="3" smth:y="3" smth:w="1" smth:h="1" smth:weight="500" smth:color="#BB1326"/>
            </Private>
            Label
          </Text>
        </ConductingEquipment>
      `);
            const text = doc.querySelector('Text');
            expectHandlerSignatures(text, {}, {
                Move: 'oscd-sld-start-interaction/placingLabel',
            });
        });
    });
});
//# sourceMappingURL=sld-context-menu-factory.spec.js.map