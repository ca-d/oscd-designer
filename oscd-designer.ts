import { LitElement, html, css, nothing } from 'lit';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import { property, state } from 'lit/decorators.js';

import { Edit, newEditEvent, Update } from '@openscd/open-scd-core';
import { getReference, identity } from '@openscd/oscd-scl';

import '@material/mwc-button';
import '@material/mwc-icon-button';
import '@material/mwc-icon';

import './sld-editor.js';

import { bayIcon, equipmentIcon, voltageLevelIcon } from './icons.js';
import {
  attributes,
  ConnectDetail,
  ConnectEvent,
  connectionStartPoints,
  PlaceEvent,
  Point,
  privType,
  ResizeEvent,
  sldNs,
  StartConnectDetail,
  StartConnectEvent,
  StartEvent,
  xmlnsNs,
} from './util.js';

function uniqueName(element: Element, parent: Element): string {
  const children = Array.from(parent.children);
  const oldName = element.getAttribute('name');
  if (
    oldName &&
    !children.find(child => child.getAttribute('name') === oldName)
  )
    return oldName;

  const baseName =
    element.getAttribute('name')?.replace(/[0-9]*$/, '') ??
    element.tagName.charAt(0);
  let index = 1;
  function hasName(child: Element) {
    return child.getAttribute('name') === baseName + index.toString();
  }
  while (children.find(hasName)) index += 1;

  return baseName + index.toString();
}

function cutSectionAt(section: Element, index: number, [x, y]: Point): Edit[] {
  const parent = section.parentElement;
  if (!parent) return [];
  const edits = [] as Edit[];
  const vertices = Array.from(section.children).filter(
    child => child.tagName === 'Vertex'
  );
  const vertexAtXY = vertices.find(
    ve =>
      ve.getAttributeNS(sldNs, 'x') === x.toString() &&
      ve.getAttributeNS(sldNs, 'y') === y.toString()
  );

  if (
    vertexAtXY === vertices[0] ||
    vertexAtXY === vertices[vertices.length - 1]
  )
    return [];

  const newSection = section.cloneNode(true) as Element;
  Array.from(newSection.children)
    .filter(child => child.tagName === 'Vertex')
    .slice(0, index + 1)
    .forEach(vertex => vertex.remove());
  const v = vertices[index].cloneNode() as Element;
  v.setAttributeNS(sldNs, 'esld:x', x.toString());
  v.setAttributeNS(sldNs, 'esld:y', y.toString());
  newSection.prepend(v);
  edits.push({
    node: newSection,
    parent,
    reference: section.nextElementSibling,
  });

  vertices.slice(index + 1).forEach(vertex => edits.push({ node: vertex }));

  if (!vertexAtXY) {
    const v2 = v.cloneNode();
    edits.push({ node: v2, parent: section, reference: null });
  }

  return edits;
}

function collinear(v0: Element, v1: Element, v2: Element) {
  const [[x0, y0], [x1, y1], [x2, y2]] = [v0, v1, v2].map(vertex =>
    ['x', 'y'].map(name => vertex.getAttributeNS(sldNs, name))
  );
  return (x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2);
}

function removeNode(node: Element): Edit[] {
  const edits = [{ node }] as Edit[];

  Array.from(
    node
      .closest('SCL')
      ?.querySelectorAll(
        `Terminal[connectivityNode="${node.getAttribute('pathName')}"]`
      ) ?? []
  ).forEach(terminal => edits.push({ node: terminal }));

  return edits;
}

function reverseSection(section: Element): Edit[] {
  const edits = [] as Edit[];

  Array.from(section.children)
    .reverse()
    .forEach(vertex =>
      edits.push({ parent: section, node: vertex, reference: null })
    );

  return edits;
}

function healNodeCut(cut: Element): Edit[] {
  const [x, y] = ['x', 'y'].map(name => cut.getAttributeNS(sldNs, name));

  const isCut = (vertex: Element) =>
    vertex !== cut &&
    vertex.getAttributeNS(sldNs, 'x') === x &&
    vertex.getAttributeNS(sldNs, 'y') === y;

  const cutVertices = Array.from(cut.closest('Private')?.children ?? [])
    .filter(child => child.tagName === 'Section')
    .flatMap(section => Array.from(section.children).filter(isCut));
  const cutSections = cutVertices.map(v => v.parentElement) as Element[];

  if (cutSections.length > 2) return [];
  if (cutSections.length < 2)
    return removeNode(cut.closest('ConnectivityNode')!);

  const edits = [] as Edit[];
  const [sectionA, sectionB] = cutSections as [Element, Element];
  if (isCut(sectionA.firstElementChild!)) edits.push(reverseSection(sectionA));
  const sectionBChildren = Array.from(sectionB.children);
  if (isCut(sectionB.lastElementChild!)) sectionBChildren.reverse();

  sectionBChildren
    .slice(1)
    .forEach(node => edits.push({ parent: sectionA, node, reference: null }));

  const cutA = Array.from(sectionA.children).find(isCut);
  const neighbourA = isCut(sectionA.firstElementChild!)
    ? sectionA.children[1]
    : sectionA.children[sectionA.childElementCount - 2];
  const neighbourB = sectionBChildren[1];
  if (
    neighbourA &&
    cutA &&
    neighbourB &&
    collinear(neighbourA, cutA, neighbourB)
  )
    edits.push({ node: cutA });
  edits.push({ node: sectionB });

  return edits;
}

function removeTerminal(terminal: Element): Edit[] {
  const edits = [] as Edit[];

  const equipment = terminal.parentElement;
  edits.push({ node: terminal });
  const pathName = terminal.getAttribute('connectivityNode');
  const cNode = terminal
    .closest('SCL')
    ?.querySelector(`ConnectivityNode[pathName="${pathName}"]`);
  const priv = cNode?.querySelector(`Private[type="${privType}"]`);
  const vertexAt = `${identity(equipment)}>${terminal.getAttribute('name')}`;
  const vertex = priv?.querySelector(`Vertex[*|at="${vertexAt}"]`);
  const section = vertex?.parentElement;
  if (!section) return edits;
  edits.push({ node: section });
  const cut =
    vertex === section.lastElementChild
      ? section.firstElementChild
      : section.lastElementChild;

  if (cut) edits.push(...healNodeCut(cut));

  return edits;
}

function updateTerminals(
  parent: Element,
  cNode: Element,
  substationName: string,
  voltageLevelName: string,
  bayName: string,
  cNodeName: string,
  connectivityNode: string
) {
  const updates = [] as Edit[];

  const [oldSubstationName, oldVoltageLevelName, oldBayName] = [
    'Substation',
    'VoltageLevel',
    'Bay',
  ].map(tag => cNode.closest(tag)?.getAttribute('name') ?? '');
  const oldConnectivityNode = `${oldSubstationName}/${oldVoltageLevelName}/${oldBayName}/${cNodeName}`;

  const terminals = Array.from(
    parent
      .closest('SCL')
      ?.querySelectorAll(
        `Terminal[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${cNodeName}"], Terminal[connectivityNode="${oldConnectivityNode}"]`
      ) ?? []
  );
  terminals.forEach(element =>
    updates.push({
      element,
      attributes: {
        substationName,
        voltageLevelName,
        bayName,
        connectivityNode,
      },
    })
  );

  return updates;
}

function updateConnectivityNodes(
  element: Element,
  parent: Element,
  name: string
) {
  const updates = [] as Edit[];

  const cNodes = Array.from(element.getElementsByTagName('ConnectivityNode'));
  if (element.tagName === 'ConnectivityNode') cNodes.push(element);
  const substationName = parent.closest('Substation')!.getAttribute('name');
  let voltageLevelName = parent.closest('VoltageLevel')?.getAttribute('name');
  if (element.tagName === 'VoltageLevel') voltageLevelName = name;

  cNodes.forEach(cNode => {
    let cNodeName = cNode.getAttribute('name');
    if (element === cNode) cNodeName = name;
    let bayName = cNode.parentElement?.getAttribute('name') ?? '';
    if (element.tagName === 'Bay') bayName = name;
    if (parent.tagName === 'Bay') bayName = parent.getAttribute('name') ?? '';

    if (cNodeName && bayName) {
      const pathName = `${substationName}/${voltageLevelName}/${bayName}/${cNodeName}`;
      updates.push({
        element: cNode,
        attributes: {
          pathName,
        },
      });
      // TODO: remove superfluous terminals
      if (substationName && voltageLevelName && bayName)
        updates.push(
          ...updateTerminals(
            parent,
            cNode,
            substationName,
            voltageLevelName,
            bayName,
            cNodeName,
            pathName
          )
        );
    }
  });
  return updates;
}

function reparentElement(element: Element, parent: Element): Edit[] {
  const edits: Edit[] = [];
  edits.push({
    node: element,
    parent,
    reference: getReference(parent, element.tagName),
  });
  const newName = uniqueName(element, parent);
  if (newName !== element.getAttribute('name'))
    edits.push({ element, attributes: { name: newName } });
  edits.push(...updateConnectivityNodes(element, parent, newName));
  return edits;
}

export default class Designer extends LitElement {
  @property()
  doc!: XMLDocument;

  @property()
  editCount = -1;

  @state()
  templateElements: Record<string, Element> = {};

  @state()
  gridSize = 32;

  @state()
  resizing?: Element;

  @state()
  placing?: Element;

  @state()
  connecting?: {
    equipment: Element;
    path: Point[];
    terminal: 'top' | 'bottom';
  };

  zoomIn(step = 4) {
    this.gridSize += step;
  }

  zoomOut(step = 4) {
    this.gridSize -= step;
    if (this.gridSize < 4) this.gridSize = 4;
  }

  startResizing(element: Element | undefined) {
    this.reset();
    this.resizing = element;
  }

  startPlacing(element: Element | undefined) {
    this.reset();
    this.placing = element;
  }

  startConnecting({ equipment, terminal }: StartConnectDetail) {
    this.reset();
    const { close, far } = connectionStartPoints(equipment)[terminal];
    if (equipment)
      this.connecting = {
        equipment,
        path: [close, far],
        terminal,
      };
  }

  reset() {
    this.placing = undefined;
    this.resizing = undefined;
    this.connecting = undefined;
  }

  handleKeydown = ({ key }: KeyboardEvent) => {
    if (key === 'Escape') this.reset();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeydown);
  }

  updated(changedProperties: Map<string, any>) {
    if (!changedProperties.has('doc')) return;
    ['Substation', 'VoltageLevel', 'Bay', 'ConductingEquipment'].forEach(
      tag => {
        this.templateElements[tag] = this.doc.createElementNS(
          this.doc.documentElement.namespaceURI,
          tag
        );
      }
    );
  }

  rotateElement(element: Element) {
    const { rot } = attributes(element);
    const edits = [
      {
        element,
        attributes: {
          'esld:rot': {
            namespaceURI: sldNs,
            value: ((rot + 1) % 4).toString(),
          },
        },
      },
    ] as Edit[];
    if (element.tagName === 'ConductingEquipment') {
      Array.from(element.getElementsByTagName('Terminal')).forEach(terminal =>
        edits.push(...removeTerminal(terminal))
      );
    }
    this.dispatchEvent(newEditEvent(edits));
  }

  placeElement(element: Element, parent: Element, x: number, y: number) {
    const edits: Edit[] = [];
    if (element.parentElement !== parent) {
      edits.push(...reparentElement(element, parent));
    }
    edits.push({
      element,
      attributes: {
        x: { namespaceURI: sldNs, value: x.toString() },
        y: { namespaceURI: sldNs, value: y.toString() },
      },
    });

    const {
      pos: [oldX, oldY],
    } = attributes(element);

    const dx = x - oldX;
    const dy = y - oldY;

    Array.from(
      element.querySelectorAll('Bay, ConductingEquipment, Vertex')
    ).forEach(descendant => {
      const {
        pos: [descX, descY],
      } = attributes(descendant);
      edits.push({
        element: descendant,
        attributes: {
          x: { namespaceURI: sldNs, value: (descX + dx).toString() },
          y: { namespaceURI: sldNs, value: (descY + dy).toString() },
        },
      });
    });

    Array.from(element.getElementsByTagName('ConnectivityNode')).forEach(
      cNode => {
        Array.from(
          this.doc.querySelectorAll(
            `Terminal[connectivityNode="${cNode.getAttribute('pathName')}"]`
          )
        )
          .filter(terminal => terminal.closest(element.tagName) !== element)
          .forEach(terminal => edits.push(...removeTerminal(terminal)));
      }
    );
    Array.from(element.getElementsByTagName('Terminal')).forEach(terminal => {
      const cNode = this.doc.querySelector(
        `ConnectivityNode[pathName="${terminal.getAttribute(
          'connectivityNode'
        )}"]`
      );
      if (cNode?.closest(element.tagName) !== element)
        edits.push(...removeTerminal(terminal));
    });

    this.dispatchEvent(newEditEvent(edits));
    if (
      ['Bay', 'VoltageLevel'].includes(element.tagName) &&
      !element.hasAttributeNS(sldNs, 'w') &&
      !element.hasAttributeNS(sldNs, 'h')
    )
      this.startResizing(element);
    else this.reset();
  }

  connectEquipment({
    equipment,
    terminal,
    connectTo,
    toTerminal,
    path,
  }: ConnectDetail) {
    const edits = [] as Edit[];
    let cNode = connectTo;
    let connectivityNode = cNode.getAttribute('pathName') ?? '';
    let cNodeName = cNode.getAttribute('name') ?? '';
    let priv = cNode.querySelector(`Private[type="${privType}"]`);
    if (equipment === connectTo) return;
    if (
      connectivityNode &&
      equipment.querySelector(
        `Terminal[connectivityNode="${connectivityNode}"]`
      )
    )
      return;
    if (connectTo.tagName !== 'ConnectivityNode') {
      cNode = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'ConnectivityNode'
      );
      cNode.setAttribute('name', 'L1');
      const bay = equipment.closest('Bay');
      if (!bay) return;
      edits.push(...reparentElement(cNode, bay));
      connectivityNode =
        ((
          edits.find(e => 'attributes' in e && 'pathName' in e.attributes) as
            | Update
            | undefined
        )?.attributes.pathName as string | undefined) ?? '';
      cNodeName =
        ((
          edits.find(e => 'attributes' in e && 'name' in e.attributes) as
            | Update
            | undefined
        )?.attributes.name as string | undefined) ??
        cNode.getAttribute('name')!;
      priv = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Private'
      );
      priv.setAttribute('type', privType);
      edits.push({
        parent: cNode,
        node: priv,
        reference: getReference(cNode, 'Private'),
      });
    }
    if (!priv) return;
    const section = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      'Section'
    );
    edits.push({ parent: priv!, node: section, reference: null });
    const fromTermName = terminal === 'top' ? 'T1' : 'T2';
    const toTermName = toTerminal === 'top' ? 'T1' : 'T2';
    path.forEach(([x, y], i) => {
      const vertex = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Vertex'
      );
      vertex.setAttributeNS(sldNs, 'esld:x', x.toString());
      vertex.setAttributeNS(sldNs, 'esld:y', y.toString());
      if (i === 0)
        vertex.setAttributeNS(
          sldNs,
          'esld:at',
          `${identity(equipment)}>${fromTermName}`
        );
      else if (
        i === path.length - 1 &&
        connectTo.tagName !== 'ConnectivityNode'
      )
        vertex.setAttributeNS(
          sldNs,
          'esld:at',
          `${identity(connectTo)}>${toTermName}`
        );
      edits.push({ parent: section, node: vertex, reference: null });
    });
    if (connectTo.tagName === 'ConnectivityNode') {
      const [x, y] = path[path.length - 1];
      Array.from(priv.children)
        .filter(child => child.tagName === 'Section')
        .find(s => {
          const sectionPath = Array.from(s.children)
            .filter(child => child.tagName === 'Vertex')
            .map(v => attributes(v).pos);
          for (let i = 0; i < sectionPath.length - 1; i += 1) {
            const [x0, y0] = sectionPath[i];
            const [x1, y1] = sectionPath[i + 1];
            if (
              (y0 === y &&
                y === y1 &&
                ((x0 < x && x < x1) || (x1 < x && x < x0))) ||
              (x0 === x &&
                x === x1 &&
                ((y0 < y && y < y1) || (y1 < y && y < y0))) ||
              (y0 === y && x0 === x)
            ) {
              edits.push(cutSectionAt(s, i, [x, y]));
              return true;
            }
          }
          return false;
        });
    }
    const [substationName, voltageLevelName, bayName, cNodeNameFromPath] =
      connectivityNode.split('/', 4);
    if (cNodeNameFromPath !== cNodeName) return;
    const fromTermElement = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      'Terminal'
    );
    fromTermElement.setAttribute('name', fromTermName);
    fromTermElement.setAttribute('connectivityNode', connectivityNode);
    fromTermElement.setAttribute('substationName', substationName);
    fromTermElement.setAttribute('voltageLevelName', voltageLevelName);
    fromTermElement.setAttribute('bayName', bayName);
    fromTermElement.setAttribute('cNodeName', cNodeName);
    const fromTerminalCount = Array.from(equipment.children).filter(
      child => child.tagName === 'Terminal'
    ).length;
    if (fromTerminalCount > 1) return;
    edits.push({
      node: fromTermElement,
      parent: equipment,
      reference: getReference(equipment, 'Terminal'),
    });
    if (connectTo.tagName === 'ConductingEquipment') {
      const toTermElement = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Terminal'
      );
      toTermElement.setAttribute('name', toTermName);
      toTermElement.setAttribute('connectivityNode', connectivityNode);
      toTermElement.setAttribute('substationName', substationName);
      toTermElement.setAttribute('voltageLevelName', voltageLevelName);
      toTermElement.setAttribute('bayName', bayName);
      toTermElement.setAttribute('cNodeName', cNodeName);
      const toTerminalCount = Array.from(connectTo.children).filter(
        child => child.tagName === 'Terminal'
      ).length;
      if (toTerminalCount > 1) return;
      edits.push({
        node: toTermElement,
        parent: connectTo,
        reference: getReference(connectTo, 'Terminal'),
      });
    }
    this.reset();
    this.dispatchEvent(newEditEvent(edits));
  }

  render() {
    if (!this.doc) return html`<p>Please open an SCL document</p>`;
    return html`<main>
      ${Array.from(this.doc.querySelectorAll(':root > Substation')).map(
        subs =>
          html`<sld-editor
            .doc=${this.doc}
            .editCount=${this.editCount}
            .substation=${subs}
            .gridSize=${this.gridSize}
            .resizing=${this.resizing}
            .placing=${this.placing}
            .connecting=${this.connecting}
            @oscd-sld-start-resize=${({ detail }: StartEvent) => {
              this.startResizing(detail);
            }}
            @oscd-sld-start-place=${({ detail }: StartEvent) => {
              this.startPlacing(detail);
            }}
            @oscd-sld-start-connect=${({ detail }: StartConnectEvent) => {
              this.startConnecting(detail);
            }}
            @oscd-sld-resize=${({ detail: { element, w, h } }: ResizeEvent) => {
              this.dispatchEvent(
                newEditEvent({
                  element,
                  attributes: {
                    w: { namespaceURI: sldNs, value: w.toString() },
                    h: { namespaceURI: sldNs, value: h.toString() },
                  },
                })
              );
              this.reset();
            }}
            @oscd-sld-place=${({
              detail: { element, parent, x, y },
            }: PlaceEvent) => this.placeElement(element, parent, x, y)}
            @oscd-sld-connect=${({ detail }: ConnectEvent) =>
              this.connectEquipment(detail)}
            @oscd-sld-rotate=${({ detail }: StartEvent) =>
              this.rotateElement(detail)}
          ></sld-editor>`
      )}
      <nav>
        ${Array.from(this.doc.documentElement.children).find(c =>
          c.querySelector(':scope > VoltageLevel > Bay')
        )
          ? ['CTR', 'VTR', 'DIS', 'CBR', 'IFL'].map(
              eqType => html`<mwc-fab
                mini
                label="Add ${eqType}"
                @click=${() => {
                  const element =
                    this.templateElements.ConductingEquipment!.cloneNode() as Element;
                  element.setAttribute('type', eqType);
                  element.setAttribute('name', `${eqType}1`);
                  this.startPlacing(element);
                }}
              >
                ${equipmentIcon(eqType)}
              </mwc-fab>`
            )
          : nothing}${Array.from(this.doc.documentElement.children).find(c =>
          c.querySelector(':scope > VoltageLevel')
        )
          ? html`<mwc-fab
              mini
              label="Add Bay"
              @click=${() => {
                const element =
                  this.templateElements.Bay!.cloneNode() as Element;
                this.startPlacing(element);
              }}
            >
              ${bayIcon}
            </mwc-fab>`
          : nothing}${Array.from(this.doc.documentElement.children).find(
          c => c.tagName === 'Substation'
        )
          ? html`<mwc-fab
              mini
              label="Add VoltageLevel"
              @click=${() => {
                const element =
                  this.templateElements.VoltageLevel!.cloneNode() as Element;
                this.startPlacing(element);
              }}
            >
              ${voltageLevelIcon}
            </mwc-fab>`
          : nothing}<mwc-fab
          mini
          icon="margin"
          @click=${() => this.insertSubstation()}
          label="Add Substation"
        >
        </mwc-fab
        ><mwc-icon-button
          icon="zoom_in"
          label="Zoom In"
          @click=${() => this.zoomIn()}
        >
        </mwc-icon-button
        ><mwc-icon-button
          icon="zoom_out"
          label="Zoom Out"
          @click=${() => this.zoomOut()}
        >
        </mwc-icon-button
        >${this.placing || this.resizing
          ? html`<mwc-icon-button
              icon="close"
              label="Cancel action"
              @click=${() => this.reset()}
            >
            </mwc-icon-button>`
          : nothing}
      </nav>
    </main>`;
  }

  insertSubstation() {
    const parent = this.doc.documentElement;
    const node = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      'Substation'
    );
    const reference = getReference(parent, 'Substation');
    let index = 1;
    while (this.doc.querySelector(`:root > Substation[name="S${index}"]`))
      index += 1;
    node.setAttribute('name', `S${index}`);
    node.setAttributeNS(xmlnsNs, 'xmlns:esld', sldNs);
    node.setAttributeNS(sldNs, 'esld:w', '50');
    node.setAttributeNS(sldNs, 'esld:h', '25');
    this.dispatchEvent(newEditEvent({ parent, node, reference }));
  }

  static styles = css`
    main {
      padding: 16px;
    }

    div {
      margin-top: 12px;
    }

    nav {
      position: fixed;
      bottom: 4px;
      left: 4px;
    }
  `;
}
