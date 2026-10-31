import { getReference } from '@openscd/scl-lib';
import { isIedReferenceElement } from './ied.js';
import { privType, sldNs } from '../foundations.js';
import { getSLDAttributes, xmlBoolean } from './sld-attributes.js';
import { busSections, isBusBar, } from './connectivity.js';
function nonBusSections(element) {
    const privates = element.querySelectorAll(`:scope Private[type="${privType}"]`);
    return Array.from(privates)
        .flatMap(priv => Array.from(priv.children).filter(child => child.localName === 'Section' && child.namespaceURI === sldNs))
        .filter(section => !getSLDAttributes(section, 'bus'));
}
function collinear(v0, v1, v2) {
    const [[x0, y0], [x1, y1], [x2, y2]] = [v0, v1, v2].map(vertex => ['x', 'y'].map(name => getSLDAttributes(vertex, name)));
    return (x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2);
}
function reverseSection(section) {
    const edits = [];
    Array.from(section.children)
        .reverse()
        .forEach(vertex => edits.push({ parent: section, node: vertex, reference: null }));
    return edits;
}
function healSectionCut(cut) {
    const [x, y] = ['x', 'y'].map(name => getSLDAttributes(cut, name));
    const isCut = (vertex) => vertex !== cut &&
        getSLDAttributes(vertex, 'x') === x &&
        getSLDAttributes(vertex, 'y') === y;
    const cutVertices = Array.from(cut.closest('Private').getElementsByTagNameNS(sldNs, 'Section')).flatMap(section => Array.from(section.children).filter(isCut));
    const cutSections = cutVertices.map(v => v.parentElement);
    if (cutSections.length > 2) {
        return [];
    }
    if (cutSections.length < 2) {
        return removeNode(cut.closest('ConnectivityNode'));
    }
    const [busA, busB] = cutSections.map(section => xmlBoolean(getSLDAttributes(section, 'bus')));
    if (busA !== busB) {
        return [];
    }
    const edits = [];
    const [sectionA, sectionB] = cutSections;
    if (isCut(sectionA.firstElementChild)) {
        edits.push(reverseSection(sectionA));
    }
    const sectionBChildren = Array.from(sectionB.children);
    if (isCut(sectionB.lastElementChild)) {
        sectionBChildren.reverse();
    }
    sectionBChildren
        .slice(1)
        .forEach(node => edits.push({ parent: sectionA, node, reference: null }));
    const cutA = Array.from(sectionA.children).find(isCut);
    const neighbourA = isCut(sectionA.firstElementChild)
        ? sectionA.children[1]
        : sectionA.children[sectionA.childElementCount - 2];
    const neighbourB = sectionBChildren[1];
    if (neighbourA &&
        cutA &&
        neighbourB &&
        collinear(neighbourA, cutA, neighbourB)) {
        edits.push({ node: cutA });
    }
    edits.push({ node: sectionB });
    return edits;
}
function updateTerminals(_parent, cNode, substationName, voltageLevelName, bayName, cNodeName, connectivityNode) {
    const updates = [];
    const oldPathName = cNode.getAttribute('pathName');
    if (!oldPathName) {
        return [];
    }
    const [oldSubstationName, oldVoltageLevelName, oldBayName, oldCNodeName] = oldPathName.split('/');
    const terminals = Array.from(cNode.getRootNode().querySelectorAll(`Terminal[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], Terminal[connectivityNode="${oldPathName}"], NeutralPoint[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], NeutralPoint[connectivityNode="${oldPathName}"]`));
    terminals.forEach((terminal) => {
        updates.push({
            element: terminal,
            attributes: {
                substationName,
                voltageLevelName,
                bayName,
                connectivityNode,
                cNodeName,
            },
        });
    });
    return updates;
}
function updateConnectivityNodes(element, parent, name) {
    const updates = [];
    const cNodes = Array.from(element.getElementsByTagName('ConnectivityNode'));
    if (element.tagName === 'ConnectivityNode') {
        cNodes.push(element);
    }
    const substationName = parent.closest('Substation').getAttribute('name');
    let voltageLevelName = parent.closest('VoltageLevel')?.getAttribute('name');
    if (element.tagName === 'VoltageLevel') {
        voltageLevelName = name;
    }
    cNodes.forEach((cNode) => {
        let cNodeName = cNode.getAttribute('name');
        if (element === cNode) {
            cNodeName = name;
        }
        let bayName = cNode.parentElement?.getAttribute('name') ?? '';
        if (element.tagName === 'Bay') {
            bayName = name;
        }
        if (parent.tagName === 'Bay' && parent.hasAttribute('name')) {
            bayName = parent.getAttribute('name');
        }
        if (cNodeName && bayName) {
            const pathName = `${substationName}/${voltageLevelName}/${bayName}/${cNodeName}`;
            updates.push({
                element: cNode,
                attributes: {
                    pathName,
                },
            });
            if (substationName && voltageLevelName && bayName) {
                updates.push(...updateTerminals(parent, cNode, substationName, voltageLevelName, bayName, cNodeName, pathName));
            }
        }
    });
    return updates;
}
/** Builds edits to remove a connectivity node or busbar and its dependent terminal references. */
export function removeNode(node) {
    const edits = [];
    if (busSections(node).length > 0) {
        nonBusSections(node).forEach(section => edits.push({ node: section }));
        const sections = busSections(node);
        const busSection = sections[0];
        Array.from(busSection.children)
            .slice(1)
            .forEach(vertex => edits.push({ node: vertex }));
        const lastVertex = sections[sections.length - 1].lastElementChild;
        if (lastVertex) {
            edits.push({ parent: busSection, node: lastVertex, reference: null });
        }
        sections.slice(1).forEach(section => edits.push({ node: section }));
    }
    else {
        edits.push({ node });
    }
    Array.from(node.ownerDocument.querySelectorAll(`Terminal[connectivityNode="${node.getAttribute('pathName')}"], NeutralPoint[connectivityNode="${node.getAttribute('pathName')}"]`)).forEach(terminal => edits.push({ node: terminal }));
    return edits;
}
/** Builds edits to move an element to a new parent and repair affected connectivity paths. */
export function reparentElement(element, parent) {
    const edits = [];
    edits.push({
        node: element,
        parent,
        reference: getReference(parent, element.tagName),
    });
    const newName = uniqueName(element, parent);
    if (!isIedReferenceElement(element) &&
        newName !== element.getAttribute('name')) {
        edits.push({ element, attributes: { name: newName } });
    }
    edits.push(...updateConnectivityNodes(element, parent, newName));
    return edits;
}
/** Builds edits to detach a terminal or neutral point and heal orphaned connectivity geometry. */
export function removeTerminal(terminal) {
    const edits = [];
    edits.push({ node: terminal });
    const pathName = terminal.getAttribute('connectivityNode');
    const cNode = terminal.ownerDocument.querySelector(`ConnectivityNode[pathName="${pathName}"]`);
    const otherTerminals = Array.from(terminal.ownerDocument.querySelectorAll(`Terminal[connectivityNode="${pathName}"], NeutralPoint[connectivityNode="${pathName}"]`)).filter(t => t !== terminal);
    if (cNode &&
        otherTerminals.length > 1 &&
        otherTerminals.some(t => t.closest('Bay')) &&
        otherTerminals.every(t => t.closest('Bay') !== cNode.closest('Bay')) &&
        !isBusBar(cNode.closest('Bay'))) {
        const newParent = otherTerminals
            .find(t => t.closest('Bay'))
            .closest('Bay');
        if (newParent) {
            edits.push(...reparentElement(cNode, newParent));
        }
    }
    if (cNode &&
        otherTerminals.length <= 1 &&
        cNode.getAttribute('name') !== 'grounded') {
        edits.push(...removeNode(cNode));
        return edits;
    }
    const priv = cNode?.querySelector(`Private[type="${privType}"]`);
    const vertex = priv?.querySelector(`Vertex[*|uuid="${getSLDAttributes(terminal, 'uuid')}"]`);
    const section = vertex?.parentElement;
    if (!section) {
        return edits;
    }
    edits.push({ node: section });
    const cut = vertex === section.lastElementChild
        ? section.firstElementChild
        : section.lastElementChild;
    if (cut) {
        edits.push(...healSectionCut(cut));
    }
    return edits;
}
/** Returns a unique name for an element under a parent, preserving its current name when possible. */
export function uniqueName(element, parent) {
    const children = Array.from(parent.children);
    const oldName = element.getAttribute('name');
    if (oldName &&
        !children.find(child => child.getAttribute('name') === oldName)) {
        return oldName;
    }
    const baseName = element.getAttribute('name')?.replace(/[0-9]*$/, '') ??
        element.getAttribute('type') ??
        element.tagName.charAt(0);
    let index = 1;
    function hasName(child) {
        return child.getAttribute('name') === baseName + index.toString();
    }
    while (children.find(hasName)) {
        index += 1;
    }
    return baseName + index.toString();
}
//# sourceMappingURL=connectivity-edits.js.map