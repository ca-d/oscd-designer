export const privType = 'Transpower-SLD-Vertices';
export const sldNs = 'https://transpower.co.nz/SCL/SSD/SLD/v0';
export const xmlnsNs = 'http://www.w3.org/2000/xmlns/';
export const svgNs = 'http://www.w3.org/2000/svg';

export type Point = [number, number];
export type Attrs = {
  pos: Point;
  dim: Point;
  flip: boolean;
  rot: 0 | 1 | 2 | 3;
};

export function attributes(element: Element): Attrs {
  const [x, y, w, h, rotVal] = ['x', 'y', 'w', 'h', 'rot'].map(name =>
    parseFloat(element.getAttributeNS(sldNs, name) ?? '0')
  );
  const pos = [x, y].map(d => Math.max(0, d)) as Point;
  const dim = [w, h].map(d => Math.max(1, d)) as Point;

  const flip = ['true', '1'].includes(
    element.getAttributeNS(sldNs, 'flip')?.trim() ?? 'false'
  );

  const rot = (((rotVal % 4) + 4) % 4) as 0 | 1 | 2 | 3;

  return { pos, dim, flip, rot };
}

export function connectionStartPoints(equipment: Element): [Point, Point] {
  const {
    pos: [x, y],
    rot,
  } = attributes(equipment);
  const input = !Array.from(equipment.children).find(
    c => c.tagName === 'Terminal'
  );
  const terminalPoints: Point[] = [
    [x + 0.5, input ? y : y + 1],
    [input ? x + 1 : x, y + 0.5],
    [x + 0.5, input ? y + 1 : y],
    [input ? x : x + 1, y + 0.5],
  ];
  const connectionPoints: Point[] = [
    [x + 0.5, input ? y - 0.5 : y + 1.5],
    [input ? x + 1.5 : x - 0.5, y + 0.5],
    [x + 0.5, input ? y + 1.5 : y - 0.5],
    [input ? x - 0.5 : x + 1.5, y + 0.5],
  ];

  return [terminalPoints[rot], connectionPoints[rot]];
}

export type ResizeDetail = {
  w: number;
  h: number;
  element: Element;
};
export type ResizeEvent = CustomEvent<ResizeDetail>;
export function newResizeEvent(detail: ResizeDetail): ResizeEvent {
  return new CustomEvent('oscd-sld-resize', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type PlaceDetail = {
  x: number;
  y: number;
  element: Element;
  parent: Element;
};
export type PlaceEvent = CustomEvent<PlaceDetail>;
export function newPlaceEvent(detail: PlaceDetail): PlaceEvent {
  return new CustomEvent('oscd-sld-place', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ConnectDetail = {
  equipment: Element;
  path: Point[];
  connectTo: Element;
};
export type ConnectEvent = CustomEvent<ConnectDetail>;
export function newConnectEvent(detail: ConnectDetail): ConnectEvent {
  return new CustomEvent('oscd-sld-connect', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type StartEvent = CustomEvent<Element>;
export function newStartResizeEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-resize', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartPlaceEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-place', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartConnectEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-connect', {
    bubbles: true,
    composed: true,
    detail,
  });
}

declare global {
  interface ElementEventMap {
    ['oscd-sld-resize']: ResizeEvent;
    ['oscd-sld-place']: PlaceEvent;
    ['oscd-sld-connect']: ConnectEvent;
    ['oscd-sld-start-resize']: StartEvent;
    ['oscd-sld-start-place']: StartEvent;
    ['oscd-sld-start-connect']: StartEvent;
  }
}
