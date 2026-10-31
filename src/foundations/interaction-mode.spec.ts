import { expect } from '@open-wc/testing';

import {
  idle,
  locked,
  placing,
  placingLabel,
  resizingBR,
  resizingTL,
  connectingFrom,
  reroutingSection,
  isMode,
  targetInMode,
  connectDetail,
} from './interaction-mode.js';
import { createSCLDoc } from '../test-helpers.js';

describe('interaction-mode constructors', () => {
  const doc = createSCLDoc(`
    <Substation name="S1">
      <VoltageLevel name="V1">
        <Bay name="B1">
          <ConductingEquipment name="QA1" type="CBR"/>
        </Bay>
      </VoltageLevel>
    </Substation>
  `);
  const element = doc.querySelector('ConductingEquipment')!;

  it('idle() builds the idle variant with no payload', () => {
    expect(idle()).to.deep.equal({ mode: 'idle' });
  });

  it('locked() builds the locked variant with no payload', () => {
    expect(locked()).to.deep.equal({ mode: 'locked' });
  });

  it('placing() carries the element and offset', () => {
    expect(placing(element, [3, 4])).to.deep.equal({
      mode: 'placing',
      element,
      offset: [3, 4],
    });
  });

  it('placingLabel() carries the element and offset', () => {
    expect(placingLabel(element, [2, 5])).to.deep.equal({
      mode: 'placingLabel',
      element,
      offset: [2, 5],
    });
  });

  it('resizingBR() carries only the element', () => {
    expect(resizingBR(element)).to.deep.equal({
      mode: 'resizingBR',
      element,
    });
  });

  it('resizingTL() carries only the element', () => {
    expect(resizingTL(element)).to.deep.equal({
      mode: 'resizingTL',
      element,
    });
  });

  it('connectingFrom() carries element, terminal and an empty path by default', () => {
    expect(connectingFrom(element, 'T1')).to.deep.equal({
      mode: 'connectingFrom',
      element,
      terminal: 'T1',
      path: [],
    });
  });

  it('connectingFrom() accepts an initial path', () => {
    expect(connectingFrom(element, 'N2', [[1, 1]])).to.deep.equal({
      mode: 'connectingFrom',
      element,
      terminal: 'N2',
      path: [[1, 1]],
    });
  });

  it('connectingFrom() can carry the terminal whose connection it replaces', () => {
    const bay = doc.querySelector('Bay')!;
    expect(connectingFrom(element, 'T1', [], bay)).to.deep.equal({
      mode: 'connectingFrom',
      element,
      terminal: 'T1',
      path: [],
      replacing: bay,
    });
  });

  it('reroutingSection() carries only the section', () => {
    expect(reroutingSection(element)).to.deep.equal({
      mode: 'reroutingSection',
      element,
    });
  });
});

describe('interaction-mode selectors', () => {
  const doc = createSCLDoc(`
    <Substation name="S1">
      <VoltageLevel name="V1">
        <Bay name="B1">
          <ConductingEquipment name="QA1" type="CBR"/>
        </Bay>
      </VoltageLevel>
    </Substation>
  `);
  const element = doc.querySelector('ConductingEquipment')!;
  const other = doc.querySelector('Bay')!;

  describe('isMode', () => {
    it('is true when the active mode is one of the given modes', () => {
      expect(isMode(resizingBR(element), 'resizingBR', 'resizingTL')).to.be.true;
      expect(isMode(idle(), 'idle')).to.be.true;
    });

    it('is false when the active mode is not among the given modes', () => {
      expect(isMode(placing(element, [0, 0]), 'resizingBR', 'idle')).to.be.false;
      expect(isMode(idle(), 'placing')).to.be.false;
    });
  });

  describe('targetInMode', () => {
    it('returns the subject element when the mode matches', () => {
      expect(targetInMode(placing(element, [0, 0]), 'placing')).to.equal(
        element,
      );
      expect(
        targetInMode(connectingFrom(element, 'T1'), 'connectingFrom'),
      ).to.equal(element);
    });

    it('returns undefined when the mode does not match', () => {
      expect(targetInMode(placing(element, [0, 0]), 'resizingBR')).to.be
        .undefined;
    });

    it('returns undefined for the element-less idle mode', () => {
      expect(targetInMode(idle(), 'idle')).to.be.undefined;
    });

    it('distinguishes the subject from other elements (identity check)', () => {
      const state = resizingBR(element);
      expect(targetInMode(state, 'resizingBR') === element).to.be.true;
      expect(targetInMode(state, 'resizingBR') === other).to.be.false;
    });
  });

  describe('connectDetail', () => {
    it('exposes from/path/fromTerminal while connecting', () => {
      expect(connectDetail(connectingFrom(element, 'T2', [[1, 1]]))).to.deep.equal(
        {
          from: element,
          path: [[1, 1]],
          fromTerminal: 'T2',
        },
      );
    });

    it('returns undefined when not connecting', () => {
      expect(connectDetail(resizingTL(element))).to.be.undefined;
      expect(connectDetail(idle())).to.be.undefined;
    });
  });
});
