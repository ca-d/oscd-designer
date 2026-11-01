/**
 * Splitting and joining connectivity nodes along their wires.
 *
 * Taking a wire out of a connectivity node can leave its other wires in
 * several pieces. Each piece that still connects two or more terminals becomes
 * a connectivity node of its own; a piece that connects fewer is removed along
 * with its terminal. Drawing a new wire from one connectivity node to another
 * joins the two into one.
 */

import { getReference } from '@openscd/scl-lib';

import { cutSectionAt } from './edits.js';
import {
  attributes,
  getSLDAttributes,
  setSLDAttributes,
  xmlBoolean,
} from './sld-attributes.js';
import { privType, sldNs, uuid } from '../foundations.js';

import type { EditV2 } from '@openscd/oscd-api';
import type { ConnectDetail } from './events.js';
import type { Point } from './geometry.js';

const STEP = 0.5;

const vertices = (section: Element) =>
  Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));

const key = ([x, y]: Point) => `${x},${y}`;

const isBus = (section: Element) =>
  xmlBoolean(getSLDAttributes(section, 'bus'));

function sectionsOf(cNode: Element): Element[] {
  return Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section'));
}

function terminalsOf(cNode: Element): Element[] {
  const pathName = cNode.getAttribute('pathName');
  return Array.from(
    cNode.ownerDocument.querySelectorAll('Terminal, NeutralPoint'),
  ).filter(terminal => terminal.getAttribute('connectivityNode') === pathName);
}

/** The terminals and neutral points the ends of `section` are attached to. */
export function sectionTerminals(section: Element): Element[] {
  const cNode = section.closest('ConnectivityNode');
  const uuids = vertices(section)
    .map(vertex => getSLDAttributes(vertex, 'uuid'))
    .filter(id => id);
  return cNode
    ? terminalsOf(cNode).filter(terminal =>
      uuids.includes(getSLDAttributes(terminal, 'uuid')),
    )
    : [];
}

/** The groups of `sections` that are joined to each other where their vertices meet. */
function pieces(sections: Element[]): Element[][] {
  const groups = sections.map(section => [section]);
  const at = new Map<string, Element[]>();
  sections.forEach((section) => {
    vertices(section).forEach((vertex) => {
      const k = key(attributes(vertex).pos);
      at.set(k, [...(at.get(k) ?? []), section]);
    });
  });
  const groupOf = (section: Element) =>
    groups.find(group => group.includes(section))!;
  at.forEach((meeting) => {
    meeting.slice(1).forEach((section) => {
      const [first, other] = [groupOf(meeting[0]), groupOf(section)];
      if (first !== other) {
        first.push(...other);
        groups.splice(groups.indexOf(other), 1);
      }
    });
  });
  return groups;
}

function nameFor(cNode: Element, taken: Set<string>): string {
  const base = (cNode.getAttribute('name') ?? 'L').replace(/[0-9]*$/, '');
  let index = 1;
  while (taken.has(`${base}${index}`)) {
    index += 1;
  }
  return `${base}${index}`;
}

/**
 * Edits that take the wire `section` out of its connectivity node, along with
 * the terminals at its ends, and split what is left of the node where the
 * wire held it together.
 */
export function disconnectSectionEdits(section: Element): EditV2[] {
  const cNode = section.closest('ConnectivityNode');
  if (!cNode) {
    return [];
  }
  const removed = new Set(sectionTerminals(section));
  const edits: EditV2[] = [{ node: section }];

  const live = () =>
    new Set(
      terminalsOf(cNode)
        .filter(terminal => !removed.has(terminal))
        .map(terminal => getSLDAttributes(terminal, 'uuid')),
    );
  const uuidOf = (vertex: Element) => getSLDAttributes(vertex, 'uuid');

  // Wires left with an end at nothing go as well.
  let remaining = sectionsOf(cNode).filter(other => other !== section);
  for (let pruning = true; pruning; ) {
    pruning = false;
    const attached = live();
    const loose = remaining.find((other) => {
      if (isBus(other)) {
        return false;
      }
      const all = vertices(other);
      const ends = [all[0], all[all.length - 1]];
      return ends.some(
        end =>
          !attached.has(uuidOf(end)) &&
          !remaining.some(
            another =>
              another !== other &&
              vertices(another).some(
                vertex => key(attributes(vertex).pos) === key(attributes(end).pos),
              ),
          ),
      );
    });
    if (loose) {
      pruning = true;
      remaining = remaining.filter(other => other !== loose);
      edits.push({ node: loose });
      sectionTerminals(loose).forEach(terminal => removed.add(terminal));
    }
  }

  const terminalsIn = (group: Element[]) => {
    const ids = new Set(group.flatMap(s => vertices(s).map(uuidOf)));
    return terminalsOf(cNode).filter(
      terminal =>
        !removed.has(terminal) && ids.has(getSLDAttributes(terminal, 'uuid')),
    );
  };
  const groups = pieces(remaining).sort(
    (a, b) =>
      Number(b.some(isBus)) - Number(a.some(isBus)) ||
      terminalsIn(b).length - terminalsIn(a).length,
  );
  const lone = (group: Element[]) =>
    !group.some(isBus) && terminalsIn(group).length < 2;

  const bay = cNode.parentElement!;
  const pathName = cNode.getAttribute('pathName') ?? '';
  const prefix = pathName.slice(0, pathName.lastIndexOf('/'));
  const taken = new Set(
    Array.from(bay.children)
      .filter(child => child.tagName === 'ConnectivityNode')
      .map(child => child.getAttribute('name') ?? ''),
  );
  const doc = cNode.ownerDocument;

  groups.forEach((group, index) => {
    if (lone(group)) {
      group.forEach(other => edits.push({ node: other }));
      terminalsIn(group).forEach(terminal => removed.add(terminal));
      return;
    }
    if (index === 0) {
      return;
    }
    const name = nameFor(cNode, taken);
    taken.add(name);
    const node = doc.createElementNS(cNode.namespaceURI, 'ConnectivityNode');
    node.setAttribute('name', name);
    node.setAttribute('pathName', `${prefix}/${name}`);
    const priv = doc.createElementNS(cNode.namespaceURI, 'Private');
    priv.setAttribute('type', privType);
    node.appendChild(priv);
    edits.push({ parent: bay, node, reference: cNode.nextSibling });
    group.forEach(other =>
      edits.push({ parent: priv, node: other, reference: null }),
    );
    terminalsIn(group).forEach(terminal =>
      edits.push({
        element: terminal,
        attributes: { connectivityNode: `${prefix}/${name}`, cNodeName: name },
      }),
    );
  });

  edits.push(...Array.from(removed).map((terminal): EditV2 => ({ node: terminal })));
  if (!groups.length || lone(groups[0])) {
    edits.push({ node: cNode });
  }
  return edits;
}

/** Edits that cut `section` at `point` on it, so that something can join it there. */
function cutAt(section: Element, point: Point, nsp: string): EditV2[] {
  const points = vertices(section).map(vertex => attributes(vertex).pos);
  const index = points.slice(1).findIndex(([x2, y2], i) => {
    const [x1, y1] = points[i];
    return (
      (point[0] - x1) * (point[0] - x2) <= 0 &&
      (point[1] - y1) * (point[1] - y2) <= 0 &&
      (x1 === x2 || y1 === y2)
    );
  });
  return index < 0 ? [] : cutSectionAt(section, index, point, nsp);
}

/** Edits that move the wires and terminals of the connectivity node `from` over to `into`, and remove `from`. */
function mergeNodeEdits(into: Element, from: Element, intoPriv: Element): EditV2[] {
  const pathName = into.getAttribute('pathName')!;
  const [substationName, voltageLevelName, bayName] = pathName.split('/');
  return [
    ...sectionsOf(from).map(
      (section): EditV2 => ({ parent: intoPriv, node: section, reference: null }),
    ),
    ...terminalsOf(from).map(
      (terminal): EditV2 => ({
        element: terminal,
        attributes: {
          connectivityNode: pathName,
          cNodeName: into.getAttribute('name'),
          substationName,
          voltageLevelName,
          bayName,
        },
      }),
    ),
    { node: from },
  ];
}

/**
 * Edits that draw a new wire along `path` from the wire `from` (a Section) to
 * a terminal of `to`, or to another connectivity node `to`, which is then
 * joined with the one `from` belongs to.
 */
export function wireConnectEdits(
  { from, path, to, toTerminal }: ConnectDetail,
  doc: XMLDocument,
  nsp: string,
): EditV2[] {
  const cNode = from.closest('ConnectivityNode');
  if (!cNode || to === cNode || path.length < 2) {
    return [];
  }
  const joining = to.tagName === 'ConnectivityNode';
  const hasBus = (node: Element) => sectionsOf(node).some(isBus);
  if (joining && hasBus(cNode) && hasBus(to)) {
    return [];
  }
  // The node of a bus bar stays, so that the bus bar keeps its node.
  const [keep, gone] = joining && hasBus(to) ? [to, cNode] : [cNode, to];
  const priv = keep.querySelector(`Private[type="${privType}"]`);
  if (!priv) {
    return [];
  }
  // A piece cut off a wire of the node that goes is put straight into the one that stays.
  const into = (cut: EditV2[]) =>
    cut.map(edit =>
      'parent' in edit && (edit.node as Element).localName === 'Section'
        ? { ...edit, parent: priv, reference: null }
        : edit,
    );
  const edits: EditV2[] = [...into(cutAt(from, path[0], nsp))];

  const section = doc.createElementNS(sldNs, `${nsp}:Section`);
  const toUuid = uuid();
  path.forEach(([x, y], i) => {
    const vertex = doc.createElementNS(sldNs, `${nsp}:Vertex`);
    setSLDAttributes(vertex, nsp, { x: x.toString(), y: y.toString() });
    if (i === path.length - 1 && !joining) {
      setSLDAttributes(vertex, nsp, { uuid: toUuid });
    }
    section.appendChild(vertex);
  });
  edits.push({ parent: priv, node: section, reference: null });

  if (joining) {
    const end = path[path.length - 1];
    const joined = sectionsOf(to).find(other => cutAt(other, end, nsp).length);
    edits.push(
      ...into(joined ? cutAt(joined, end, nsp) : []),
      ...mergeNodeEdits(keep, gone, priv),
    );
    return edits;
  }

  const pathName = cNode.getAttribute('pathName')!;
  const [substationName, voltageLevelName, bayName] = pathName.split('/');
  const tagName = toTerminal?.startsWith('N') ? 'NeutralPoint' : 'Terminal';
  const terminal = doc.createElementNS(doc.documentElement.namespaceURI, tagName);
  setSLDAttributes(terminal, nsp, { uuid: toUuid });
  terminal.setAttribute('name', toTerminal ?? 'T1');
  terminal.setAttribute('connectivityNode', pathName);
  terminal.setAttribute('substationName', substationName);
  terminal.setAttribute('voltageLevelName', voltageLevelName);
  terminal.setAttribute('bayName', bayName);
  terminal.setAttribute('cNodeName', cNode.getAttribute('name')!);
  edits.push({ parent: to, node: terminal, reference: getReference(to, tagName) });
  return edits;
}

/**
 * The point on the wire `section` nearest to `near` where a new wire can join
 * it: on the half grid, and not where it is attached to a terminal.
 */
export function joinPoint(section: Element, near: Point): Point | undefined {
  const all = vertices(section);
  const points = all.map(vertex => attributes(vertex).pos);
  const attached = all
    .filter(vertex => getSLDAttributes(vertex, 'uuid'))
    .map(vertex => key(attributes(vertex).pos));
  const candidates = points.slice(1).flatMap(([x2, y2], i): Point[] => {
    const [x1, y1] = points[i];
    const axis = y1 === y2 ? 0 : 1;
    const fixed = axis === 0 ? y1 : x1;
    if (Math.round(fixed / STEP) * STEP !== fixed) {
      return [];
    }
    const [lo, hi] = axis === 0
      ? [Math.min(x1, x2), Math.max(x1, x2)]
      : [Math.min(y1, y2), Math.max(y1, y2)];
    const found: Point[] = [];
    for (let t = Math.ceil(lo / STEP) * STEP; t <= hi; t += STEP) {
      found.push(axis === 0 ? [t, fixed] : [fixed, t]);
    }
    return found;
  });
  return candidates
    .filter(point => !attached.includes(key(point)))
    .sort(
      (a, b) =>
        Math.hypot(a[0] - near[0], a[1] - near[1]) -
        Math.hypot(b[0] - near[0], b[1] - near[1]),
    )[0];
}
