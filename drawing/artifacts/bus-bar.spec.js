import { expect } from '@open-wc/testing';
import { identity } from '@openscd/scl-lib';
import { busBarArtifact } from './bus-bar.js';
import { makeArtifactContext, renderToSvg } from './test-context.js';
import { locked } from '../../foundations/interaction-mode.js';
import { sldFixture } from '../../test-helpers.js';
function busBarDoc() {
    return sldFixture({
        vl: { x: 0, y: 0 },
        bay: { w: 4, h: 1 },
        bayName: 'BB1',
        children: `
      <ConnectivityNode name="L">
        <Private type="OpenSCD-SLD-Layout">
          <smth:Section smth:bus="true">
            <smth:Vertex smth:x="2.5" smth:y="2.5"/>
            <smth:Vertex smth:x="5.5" smth:y="2.5"/>
          </smth:Section>
        </Private>
      </ConnectivityNode>`,
    });
}
describe('busBarArtifact', () => {
    let doc;
    let busBar;
    let substation;
    let voltageLevel;
    beforeEach(() => {
        doc = busBarDoc();
        busBar = doc.querySelector('Bay');
        substation = doc.querySelector('Substation');
        voltageLevel = doc.querySelector('VoltageLevel');
    });
    describe('matches', () => {
        it('matches a busbar Bay', () => {
            expect(busBarArtifact.matches(busBar)).to.be.true;
        });
        it('does not match a non-busbar element', () => {
            expect(busBarArtifact.matches(substation)).to.be.false;
        });
    });
    describe('state', () => {
        it('derives position, dimensions and diagram id', () => {
            const context = makeArtifactContext({ substation });
            const state = busBarArtifact.state(busBar, context);
            expect(state.position).to.deep.equal([2, 2]);
            expect(state.dimensions).to.deep.equal([4, 1]);
            expect(state.diagramElementId).to.equal(`${identity(busBar)}`);
        });
        it('omits the diagram id for a busbar outside the substation', () => {
            const context = makeArtifactContext({
                substation: doc.createElement('Substation'),
            });
            const state = busBarArtifact.state(busBar, context);
            expect(state.diagramElementId).to.be.undefined;
        });
    });
    describe('actions', () => {
        function actionsFor(context = makeArtifactContext({ substation })) {
            const state = busBarArtifact.state(busBar, context);
            return busBarArtifact.actions(busBar, context, state);
        }
        it('places into the containing voltage level on click', () => {
            const context = makeArtifactContext({ substation });
            actionsFor(context).onClick();
            const event = context.dispatched.find(e => e.type === 'oscd-sld-place');
            expect(event).to.not.be.undefined;
            expect(event.detail.element).to.equal(busBar);
            expect(event.detail.parent).to.equal(voltageLevel);
        });
        it('does nothing when disabled', () => {
            const context = makeArtifactContext({ disabled: true, substation });
            actionsFor(context).onClick();
            expect(context.dispatched).to.have.lengthOf(0);
        });
        it('does nothing in the read-only locked mode', () => {
            const context = makeArtifactContext({
                interaction: locked(),
                substation,
            });
            actionsFor(context).onClick();
            expect(context.dispatched).to.have.lengthOf(0);
        });
    });
    describe('render', () => {
        it('renders a bus group with a clickable rect', () => {
            const context = makeArtifactContext({ substation });
            const state = busBarArtifact.state(busBar, context);
            const actions = busBarArtifact.actions(busBar, context, state);
            const host = renderToSvg(busBarArtifact.render(busBar, state, actions, context));
            expect(host.querySelector('g.bus')).to.not.be.null;
            expect(host.querySelector('g.bus rect')).to.not.be.null;
        });
    });
});
//# sourceMappingURL=bus-bar.spec.js.map