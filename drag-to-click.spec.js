import { fixture, expect } from '@open-wc/testing';
import { html, LitElement } from 'lit';
import { DragToClickController, isInSldCanvas } from './drag-to-click.js';
let active = false;
let canStart = true;
let startsGesture = true;
class DragHost extends LitElement {
    constructor() {
        super(...arguments);
        this.controller = new DragToClickController(this, {
            canStart: () => canStart,
            isActive: () => active,
        });
    }
    render() {
        return html `<button id="start">start</button>
      <svg id="sld"><rect id="target" width="10" height="10" /></svg>`;
    }
}
customElements.define('drag-to-click-host', DragHost);
function mouse(type, target, x, y) {
    target.dispatchEvent(new MouseEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        bubbles: true,
        composed: true,
    }));
}
describe('drag-to-click', () => {
    let host;
    let start;
    let target;
    let clicks;
    beforeEach(async () => {
        active = false;
        canStart = true;
        startsGesture = true;
        host = await fixture(html `<drag-to-click-host></drag-to-click-host>`);
        start = host.shadowRoot.querySelector('#start');
        target = host.shadowRoot.querySelector('#target');
        clicks = [];
        host.shadowRoot.addEventListener('click', (e) => {
            clicks.push({
                target: e.composedPath()[0],
                x: e.clientX,
                y: e.clientY,
            });
            active = startsGesture;
        });
    });
    it('replays no clicks for a press without movement', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mouseup', start, 10, 10);
        expect(clicks).to.be.empty;
    });
    it('ignores movement below the drag threshold', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 12, 11);
        expect(clicks).to.be.empty;
    });
    it('starts on the pressed element once the threshold is passed', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mousemove', window, 40, 10);
        expect(clicks).to.deep.equal([{ target: start, x: 10, y: 10 }]);
    });
    it('commits on the element under the pointer at release', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mouseup', target, 50, 60);
        expect(clicks).to.deep.equal([
            { target: start, x: 10, y: 10 },
            { target: target, x: 50, y: 60 },
        ]);
    });
    it('does not commit when no gesture was started', () => {
        startsGesture = false;
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        clicks.length = 0;
        mouse('mouseup', target, 50, 60);
        expect(clicks).to.be.empty;
    });
    it('does not commit outside a substation canvas', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mouseup', start, 50, 60);
        expect(clicks).to.have.length(1);
    });
    it('swallows the browser click that follows a drag', () => {
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mouseup', target, 50, 60);
        clicks.length = 0;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
        expect(clicks).to.be.empty;
    });
    it('ignores presses the host refuses', () => {
        canStart = false;
        mouse('mousedown', start, 10, 10);
        mouse('mousemove', window, 30, 10);
        expect(clicks).to.be.empty;
    });
    it('ignores non-primary buttons', () => {
        start.dispatchEvent(new MouseEvent('mousedown', {
            button: 1,
            clientX: 10,
            clientY: 10,
            bubbles: true,
            composed: true,
        }));
        mouse('mousemove', window, 30, 10);
        expect(clicks).to.be.empty;
    });
    it('stops tracking once the host disconnects', () => {
        mouse('mousedown', start, 10, 10);
        host.remove();
        mouse('mousemove', window, 30, 10);
        expect(clicks).to.be.empty;
    });
    it('recognises a substation canvas in an event path', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'sld';
        expect(isInSldCanvas([document.body, svg])).to.be.true;
        expect(isInSldCanvas([document.body])).to.be.false;
    });
});
describe('drag-to-click with begin and finish hooks', () => {
    let begun;
    let finished;
    let host;
    let target;
    let clicks;
    class HookHost extends LitElement {
        constructor() {
            super(...arguments);
            this.controller = new DragToClickController(this, {
                canStart: () => true,
                isActive: () => true,
                begin: press => begun.push(press),
                finish: () => {
                    finished += 1;
                },
            });
        }
        render() {
            return html `<svg id="sld"><rect id="target" width="10" height="10" /></svg>`;
        }
    }
    customElements.define('drag-to-click-hook-host', HookHost);
    beforeEach(async () => {
        begun = [];
        finished = 0;
        clicks = 0;
        host = await fixture(html `<drag-to-click-hook-host></drag-to-click-hook-host>`);
        target = host.shadowRoot.querySelector('#target');
        host.shadowRoot.addEventListener('click', () => {
            clicks += 1;
        });
    });
    it('calls begin with the press instead of replaying a click', () => {
        mouse('mousedown', target, 10, 10);
        mouse('mousemove', window, 30, 10);
        expect(begun).to.have.length(1);
        expect([begun[0].clientX, begun[0].clientY]).to.deep.equal([10, 10]);
        expect(clicks).to.equal(0);
    });
    it('commits on release and then finishes', () => {
        mouse('mousedown', target, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mouseup', target, 50, 60);
        expect(clicks).to.equal(1);
        expect(finished).to.equal(1);
    });
    it('finishes when released outside a substation canvas', () => {
        mouse('mousedown', target, 10, 10);
        mouse('mousemove', window, 30, 10);
        mouse('mouseup', window, 50, 60);
        expect(clicks).to.equal(0);
        expect(finished).to.equal(1);
    });
    it('does not finish a press that never became a drag', () => {
        mouse('mousedown', target, 10, 10);
        mouse('mouseup', target, 10, 10);
        expect(finished).to.equal(0);
    });
});
//# sourceMappingURL=drag-to-click.spec.js.map