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
  ConnectEvent,
  connectionStartPoints,
  PlaceEvent,
  Point,
  privType,
  ResizeEvent,
  sldNs,
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
  const v0 = vertices[index];
  const v1 = vertices[index + 1];
  const [i0, i1] = [v0, v1].map(v =>
    parseFloat(v.getAttributeNS(sldNs, 'i') ?? '-1')
  );
  const v = v0.cloneNode() as Element;
  const i = (i0 + i1) / 2;
  v.setAttributeNS(sldNs, 'esld:x', x.toString());
  v.setAttributeNS(sldNs, 'esld:y', y.toString());
  v.setAttributeNS(sldNs, 'esld:i', i.toString());
  edits.push({
    element: section,
    attributes: { to: { namespaceURI: sldNs, value: null } },
  });

  vertices.slice(index + 1).forEach(vertex => edits.push({ node: vertex }));

  edits.push({ node: v, parent: section, reference: null });
  const newSection = section.cloneNode(true) as Element;
  Array.from(newSection.children)
    .filter(child => child.tagName === 'Vertex')
    .slice(0, index + 1)
    .forEach(vertex => vertex.remove());
  const newV = v.cloneNode() as Element;
  newSection.prepend(newV);
  const [_from, to] = ['from', 'to'].map(name =>
    section.getAttributeNS(sldNs, name)
  );
  if (to) {
    newSection.removeAttributeNS(sldNs, 'to');
    newSection.setAttributeNS(sldNs, 'esld:from', to);
  } else {
    newSection.removeAttributeNS(sldNs, 'from');
  }
  edits.push({
    node: newSection,
    parent,
    reference: section.nextElementSibling,
  });
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

  const terminals = Array.from(
    parent
      .closest('SCL')
      ?.querySelectorAll(
        `Terminal[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${cNodeName}"]`
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
  connecting?: { equipment: Element; path: Point[] };

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

  startConnecting(equipment: Element | undefined) {
    this.reset();
    if (equipment)
      this.connecting = { equipment, path: connectionStartPoints(equipment) };
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

    this.dispatchEvent(newEditEvent(edits));
    if (
      ['Bay', 'VoltageLevel'].includes(element.tagName) &&
      !element.hasAttributeNS(sldNs, 'w') &&
      !element.hasAttributeNS(sldNs, 'h')
    )
      this.startResizing(element);
    else this.reset();
  }

  connectEquipment(equipment: Element, connectTo: Element, path: Point[]) {
    const edits = [] as Edit[];
    let cNode = connectTo;
    let connectivityNode = cNode.getAttribute('pathName') ?? '';
    let cNodeName = cNode.getAttribute('name') ?? '';
    let priv = cNode.querySelector(`Private[type="${privType}"]`);
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
    section.setAttributeNS(sldNs, 'esld:from', identity(equipment).toString());
    if (connectTo.tagName !== 'ConnectivityNode')
      section.setAttributeNS(sldNs, 'esld:to', identity(connectTo).toString());
    edits.push({ parent: priv!, node: section, reference: null });
    path.forEach(([x, y], i) => {
      const vertex = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Vertex'
      );
      vertex.setAttributeNS(sldNs, 'esld:x', x.toString());
      vertex.setAttributeNS(sldNs, 'esld:y', y.toString());
      vertex.setAttributeNS(sldNs, 'esld:i', i.toString());
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
    const fromTerminal = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      'Terminal'
    );
    fromTerminal.setAttribute('name', 'T1');
    fromTerminal.setAttribute('cNodeName', cNodeName);
    fromTerminal.setAttribute('connectivityNode', connectivityNode);
    const fromTerminalCount = Array.from(equipment.children).filter(
      child => child.tagName === 'Terminal'
    ).length;
    if (fromTerminalCount > 1) return;
    edits.push(...reparentElement(fromTerminal, equipment));
    if (connectTo.tagName === 'ConductingEquipment') {
      const toTerminal = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Terminal'
      );
      toTerminal.setAttribute('name', 'T1');
      toTerminal.setAttribute('cNodeName', cNodeName);
      toTerminal.setAttribute('connectivityNode', connectivityNode);
      const toTerminalCount = Array.from(connectTo.children).filter(
        child => child.tagName === 'Terminal'
      ).length;
      if (toTerminalCount > 1) return;
      edits.push(...reparentElement(toTerminal, connectTo));
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
            @oscd-sld-start-connect=${({ detail }: StartEvent) => {
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
            @oscd-sld-connect=${({
              detail: { equipment, connectTo, path },
            }: ConnectEvent) =>
              this.connectEquipment(equipment, connectTo, path)}
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
