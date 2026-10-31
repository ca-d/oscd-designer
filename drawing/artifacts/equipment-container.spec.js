import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';
import { renderVoltageLevel, renderBay } from './equipment-container.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { placing } from '../../foundations/interaction-mode.js';
import { sldFixture } from '../../test-helpers.js';
function containerDoc() {
    return sldFixture({
        children: `
      <ConductingEquipment name="QA1" type="CBR">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="3" smth:y="3"/>
        </Private>
      </ConductingEquipment>
      <PowerTransformer name="T1">
        <Private type="OpenSCD-SLD-Layout">
          <smth:SLDAttributes smth:x="5" smth:y="5"/>
        </Private>
      </PowerTransformer>`,
    });
}
describe('renderVoltageLevel / renderBay', () => {
    let doc;
    let voltageLevel;
    let bay;
    let equipment;
    let transformer;
    let substation;
    beforeEach(() => {
        doc = containerDoc();
        voltageLevel = doc.querySelector('VoltageLevel');
        bay = doc.querySelector('Bay');
        equipment = doc.querySelector('ConductingEquipment');
        transformer = doc.querySelector('PowerTransformer');
        substation = doc.querySelector('Substation');
    });
    describe('structure', () => {
        it('renders a voltagelevel group for a VoltageLevel', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelector('g.voltagelevel')).to.not.be.null;
            expect(host.querySelector('g.voltagelevel').getAttribute('id')).to.equal(`${identity(voltageLevel)}`);
        });
        it('renders a bay group for a Bay', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderBay(bay, context));
            expect(host.querySelector('g.bay')).to.not.be.null;
        });
        it('renders nothing while placing itself without preview', () => {
            const context = makeArtifactContext({
                interaction: placing(voltageLevel, [0, 0]),
                substation,
            });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelector('g')).to.be.null;
        });
    });
    describe('child composition', () => {
        it('recurses into bays and delegates equipment/transformer rendering', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelector('g.voltagelevel g.bay')).to.not.be.null;
            expect(context.renderedChildren).to.include(equipment);
            expect(context.renderedChildren).to.include(transformer);
        });
    });
    describe('actions', () => {
        function mainRect(context) {
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            return host.querySelector('g.voltagelevel > rect');
        }
        it('starts placement of the container on click when idle', () => {
            const context = makeArtifactContext({ substation });
            mainRect(context).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 11 }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(voltageLevel);
            expect(event.detail.offset).to.deep.equal([9, 10]);
        });
        it('requests a copy on shift-click', () => {
            const context = makeArtifactContext({ substation });
            mainRect(context).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event.detail.element).to.equal(voltageLevel);
            expect(event.detail.copy).to.be.true;
        });
        it('opens the context menu on right-click when idle', () => {
            const context = makeArtifactContext({ substation });
            mainRect(context).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-open-context-menu');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(voltageLevel);
        });
        it('does not open the context menu when disabled', () => {
            const context = makeArtifactContext({ disabled: true, substation });
            mainRect(context).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
            expect(context.dispatched.some(e => e.type === 'oscd-sld-open-context-menu')).to.equal(false);
        });
        it('places into the containing voltage level while placing a bay', () => {
            const context = makeArtifactContext({ interaction: placing(bay, [0, 0]), substation });
            const host = renderToSvg(renderBay(bay, context, true));
            host
                .querySelector('g.bay > rect')
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-place');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(bay);
            expect(event.detail.parent).to.equal(voltageLevel);
        });
    });
    describe('resize handles', () => {
        it('shows two resize handles when idle and enabled', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelectorAll('g.voltagelevel > svg.handle')).to.have.lengthOf(2);
        });
        it('hides resize handles when disabled', () => {
            const context = makeArtifactContext({ disabled: true, substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelectorAll('g.voltagelevel > svg.handle')).to.have.lengthOf(0);
        });
        it('starts a top-left resize when the first handle is clicked', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            const handles = host.querySelectorAll('g.voltagelevel > svg.handle');
            handles[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.mode).to.equal('resizingTL');
            expect(event.detail.element).to.equal(voltageLevel);
        });
        it('starts a bottom-right resize when the second handle is clicked', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            const handles = host.querySelectorAll('g.voltagelevel > svg.handle');
            handles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            const event = context.dispatched.find(e => e.type === 'oscd-sld-start-interaction');
            expect(event).to.not.be.undefined;
            expect(event.detail.mode).to.equal('resizingBR');
            expect(event.detail.element).to.equal(voltageLevel);
        });
    });
    describe('interaction guards', () => {
        it('prevents default on a middle-click mousedown', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            const event = new MouseEvent('mousedown', {
                button: 1,
                bubbles: true,
                cancelable: true,
            });
            host.querySelector('g.voltagelevel > rect').dispatchEvent(event);
            expect(event.defaultPrevented).to.be.true;
        });
        it('renders a highlight rect when the container is highlighted', () => {
            const context = makeArtifactContext({
                highlight: [{ id: `${identity(voltageLevel)}`, style: { fill: 'red' } }],
                substation,
            });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            expect(host.querySelector('rect[pointer-events="none"]')).to.not.be.null;
        });
        it('ignores a right-click while an interaction is in progress', () => {
            const context = makeArtifactContext({
                interaction: placing(equipment, [0, 0]),
                substation,
            });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            host
                .querySelector('g.voltagelevel > rect')
                .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
            expect(context.dispatched.some(e => e.type === 'oscd-sld-open-context-menu')).to.be.false;
        });
        it('ignores an auxclick that is not the middle button', () => {
            const context = makeArtifactContext({ substation });
            const host = renderToSvg(renderVoltageLevel(voltageLevel, context));
            host
                .querySelector('g.voltagelevel > rect')
                .dispatchEvent(new MouseEvent('auxclick', { button: 0, bubbles: true }));
            expect(context.dispatched.some(e => e.type === 'oscd-sld-start-interaction')).to.be.false;
        });
    });
});
//# sourceMappingURL=equipment-container.spec.js.map