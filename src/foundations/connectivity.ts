import { privType, sldNs } from '../foundations.js';
import { attributes, getSLDAttributes, setSLDAttributes } from './sld-attributes.js';

import type { Point } from './geometry.js';
import type { Terminal } from './interaction-mode.js';

function sections(element: Element): Element[] {
  const privates = element.querySelectorAll(
    `:scope Private[type="${privType}"]`,
  );
  return Array.from(privates).flatMap(priv =>
    Array.from(priv.children).filter(
      child => child.localName === 'Section' && child.namespaceURI === sldNs,
    ),
  );
}

/** Returns the SLD sections in an element that are marked as busbar geometry. */
export function busSections(element: Element): Element[] {
  return sections(element).filter(
    section => getSLDAttributes(section, 'bus') === 'true',
  );
}

/** Checks whether a Bay element is represented as an SLD busbar. */
export function isBusBar(element: Element) {
  return element.tagName === 'Bay' && busSections(element).length > 0;
}

/** Creates the template Bay structure used by the palette for new busbars. */
export function makeBusBar(doc: XMLDocument, nsp: string) {
  const busBar = doc.createElementNS(doc.documentElement.namespaceURI, 'Bay');
  busBar.setAttribute('name', 'BB1');
  setSLDAttributes(busBar, nsp, { w: '2' });
  const cNode = doc.createElementNS(
    doc.documentElement.namespaceURI,
    'ConnectivityNode',
  );
  cNode.setAttribute('name', 'L');
  const priv = doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
  priv.setAttribute('type', privType);
  const section = doc.createElementNS(sldNs, `${nsp}:Section`);
  setSLDAttributes(section, nsp, { bus: 'true' });
  const v1 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
  setSLDAttributes(v1, nsp, { x: '0.5', y: '0.5' });
  section.appendChild(v1);
  const v2 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
  setSLDAttributes(v2, nsp, { x: '1.5', y: '0.5' });
  section.appendChild(v2);
  priv.appendChild(section);
  cNode.appendChild(priv);
  busBar.appendChild(cNode);
  return busBar;
}

/** Builds the slash-separated SCL connectivity path for an element and optional child path parts. */
export function connectivityPath(element: Element, ...rest: string[]): string {
  const pedigree = [];
  let child = element;
  while (child.parentElement && child.hasAttribute('name')) {
    pedigree.unshift(child.getAttribute('name')!);
    child = child.parentElement;
  }
  return [...pedigree, ...rest].join('/');
}

/** Calculates rendered anchor points for starting T1 and T2 connections from equipment. */
export function connectionStartPoints(equipment: Element): {
  T1: [Point, Point];
  T2: [Point, Point];
} {
  const {
    pos: [x, y],
    rot,
  } = attributes(equipment);

  const T1 = [
    [
      [x + 0.5, y + 0.16],
      [x + 0.84, y + 0.5],
      [x + 0.5, y + 0.84],
      [x + 0.16, y + 0.5],
    ][rot],
    [
      [x + 0.5, y],
      [x + 1, y + 0.5],
      [x + 0.5, y + 1],
      [x, y + 0.5],
    ][rot],
  ] as [Point, Point];
  const T2 = [
    [
      [x + 0.5, y + 0.84],
      [x + 0.16, y + 0.5],
      [x + 0.5, y + 0.16],
      [x + 0.84, y + 0.5],
    ][rot],
    [
      [x + 0.5, y + 1],
      [x, y + 0.5],
      [x + 0.5, y],
      [x + 1, y + 0.5],
    ][rot],
  ] as [Point, Point];

  return { T1, T2 };
}

/** The element and terminal a connection being drawn would end on, with its wire approach points. */
export type ConnectTarget = {
  to: Element;
  toTerminal: Terminal;
  near: Point;
  far: Point;
};

/** Windings may not connect directly to each other; a line equipment in between models that within a Bay. */
export function canConnectToWinding(from: Element): boolean {
  return from.tagName !== 'TransformerWinding';
}
