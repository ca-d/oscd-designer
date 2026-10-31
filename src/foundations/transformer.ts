import type { Point } from './geometry.js';
import type { Attrs } from './sld-attributes.js';

export type TransformerTerminalName = 'T1' | 'T2' | 'N1' | 'N2';

export type TransformerWindingMeasures = {
  center: Point;
  size: number;
  terminals: Partial<Record<TransformerTerminalName, Point>>;
  grounded: Partial<Record<'N1' | 'N2', [Point, Point]>>;
  arc?: {
    from: Point;
    fromCtl: Point;
    to: Point;
    toCtl: Point;
  };
  zigZagTransform?: string;
};

function shiftPoint(
  point: Point,
  rot: number,
  coord: 0 | 1,
  amount: number,
): Point {
  const shifted = point.slice() as Point;
  if (coord === 0) {
    shifted[rot % 2] += rot < 2 ? amount : -amount;
  } else {
    shifted[(rot + 1) % 2] += rot > 0 && rot < 3 ? -amount : amount;
  }
  return shifted;
}

export function transformerWindingMeasures(
  winding: Element,
  transformerPosition: Point,
  { rot, kind, flip }: Pick<Attrs, 'rot' | 'kind' | 'flip'>,
  twoWindingEarthingZigZagTransform: string,
): TransformerWindingMeasures {
  const transformer = winding.parentElement!;
  const windings = Array.from(transformer.children).filter(
    c => c.tagName === 'TransformerWinding',
  );
  const [x, y] = transformerPosition.map(c => c + 0.5);
  let center = [x, y] as Point;
  const size = 0.7;
  const grounded: Partial<Record<'N1' | 'N2', [Point, Point]>> = {};
  const terminals: Partial<Record<TransformerTerminalName, Point>> = {};
  let arc: TransformerWindingMeasures['arc'];
  let zigZagTransform: string | undefined;
  const terminalElements = Array.from(winding.children).filter(
    c => c.tagName === 'Terminal',
  );
  const terminal1 = terminalElements.find(t => t.getAttribute('name') === 'T1');
  const terminal2 = terminalElements.find(t => t.getAttribute('name') !== 'T1');
  const neutral = Array.from(winding.children).find(
    c => c.tagName === 'NeutralPoint',
  );
  const windingIndex = windings.indexOf(winding);

  if (windings.length === 1) {
    if (kind === 'earthing') {
      zigZagTransform = '';
      const n1 = shiftPoint(center, rot, 1, size);
      if (!neutral) {
        terminals.N1 = n1;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        const n1p = shiftPoint(n1, rot, 1, 0.2);
        grounded.N1 = [n1p, n1];
      }
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 1, -size);
      }
    } else {
      const sgn = flip ? -1 : 1;
      const n1 = shiftPoint(center, rot, 0, -size);
      const n2 = shiftPoint(center, rot, 0, size);
      const t1 = shiftPoint(center, rot, 1, (-size - 0.5) * sgn);
      const t2 = shiftPoint(center, rot, 1, size * sgn);
      if (!neutral) {
        terminals.N1 = n1;
        terminals.N2 = n2;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        if (neutral.getAttribute('name') === 'N1') {
          const n1p = shiftPoint(n1, rot, 0, -0.2);
          grounded.N1 = [n1p, n1];
        } else {
          const n2p = shiftPoint(n2, rot, 0, 0.2);
          grounded.N2 = [n2p, n2];
        }
      }
      arc = {
        from: n2,
        fromCtl: shiftPoint(n2, rot, 1, -sgn),
        to: t1,
        toCtl: shiftPoint(shiftPoint(t1, rot, 0, 0.2), rot, 1, 0.1 * sgn),
      };
      if (!terminal1) {
        terminals.T1 = t1;
      }
      if (!terminal2) {
        terminals.T2 = t2;
      }
    }
  } else if (windings.length === 2) {
    if (windingIndex === 1) {
      center = shiftPoint(center, rot, 1, 1);
    }
    if (kind === 'auto') {
      if (windingIndex === 1) {
        const n1 = shiftPoint(center, rot, 0, -size);
        const n2 = shiftPoint(center, rot, 0, size);
        if (!neutral) {
          terminals.N1 = n1;
          terminals.N2 = n2;
        } else if (neutral.getAttribute('cNodeName') === 'grounded') {
          if (neutral.getAttribute('name') === 'N1') {
            const n1p = shiftPoint(n1, rot, 0, -0.2);
            grounded.N1 = [n1p, n1];
          } else {
            const n2p = shiftPoint(n2, rot, 0, 0.2);
            grounded.N2 = [n2p, n2];
          }
        }
        if (!terminal1 && !terminal2) {
          terminals.T1 = shiftPoint(center, rot, 1, size);
        }
      } else {
        const sgn = flip ? -1 : 1;
        const t1 = shiftPoint(center, rot, 0, size * sgn);
        const t2 = shiftPoint(center, rot, 0, (-size - 0.5) * sgn);
        const n1 = shiftPoint(center, rot, 1, -size);
        arc = {
          from: n1,
          fromCtl: shiftPoint(n1, rot, 0, -sgn),
          to: t2,
          toCtl: shiftPoint(shiftPoint(t2, rot, 1, -0.2), rot, 0, 0.1 * sgn),
        };
        if (!terminal1) {
          terminals.T1 = t1;
        }
        if (!terminal2) {
          terminals.T2 = t2;
        }
        if (!neutral) {
          terminals.N1 = n1;
        } else if (neutral.getAttribute('cNodeName') === 'grounded') {
          const n1p = shiftPoint(n1, rot, 1, -0.2);
          grounded.N1 = [n1p, n1];
        }
      }
    } else if (kind === 'earthing') {
      if (windingIndex === 1) {
        if (!terminal1 && !terminal2) {
          terminals.T1 = shiftPoint(center, rot, 1, size);
        }
      } else {
        zigZagTransform = twoWindingEarthingZigZagTransform;
        const sgn = flip ? -1 : 1;
        if (!terminal1 && !terminal2) {
          terminals.T1 = shiftPoint(center, rot, 0, -size * sgn);
        }
        const n1 = shiftPoint(center, rot, 0, size * sgn);
        if (!neutral) {
          terminals.N1 = n1;
        } else if (neutral.getAttribute('cNodeName') === 'grounded') {
          const n1p = shiftPoint(n1, rot, 0, 0.2 * sgn);
          grounded.N1 = [n1p, n1];
        }
      }
    } else if (windingIndex === 1) {
      const n1 = shiftPoint(center, rot, 0, -size);
      const n2 = shiftPoint(center, rot, 0, +size);

      if (!neutral) {
        terminals.N1 = n1;
        terminals.N2 = n2;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        if (neutral.getAttribute('name') === 'N1') {
          const n1p = shiftPoint(n1, rot, 0, -0.2);
          grounded.N1 = [n1p, n1];
        } else {
          const n2p = shiftPoint(n2, rot, 0, 0.2);
          grounded.N2 = [n2p, n2];
        }
      }
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 1, +size);
      }
    } else {
      const n1 = shiftPoint(center, rot, 0, -size);
      const n2 = shiftPoint(center, rot, 0, +size);

      if (!neutral) {
        terminals.N1 = n1;
        terminals.N2 = n2;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        if (neutral.getAttribute('name') === 'N1') {
          const n1p = shiftPoint(n1, rot, 0, -0.2);
          grounded.N1 = [n1p, n1];
        } else {
          const n2p = shiftPoint(n2, rot, 0, 0.2);
          grounded.N2 = [n2p, n2];
        }
      }
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 1, -size);
      }
    }
  } else if (windings.length === 3) {
    if (windingIndex === 0) {
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 1, -size);
      }
      const n1 = shiftPoint(center, rot, 0, -size);
      const n2 = shiftPoint(center, rot, 0, +size);
      if (!neutral) {
        terminals.N1 = n1;
        terminals.N2 = n2;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        if (neutral.getAttribute('name') === 'N1') {
          const n1p = shiftPoint(n1, rot, 0, -0.2);
          grounded.N1 = [n1p, n1];
        } else {
          const n2p = shiftPoint(n2, rot, 0, 0.2);
          grounded.N2 = [n2p, n2];
        }
      }
    } else if (windingIndex === 1) {
      center = shiftPoint(shiftPoint(center, rot, 0, 0.5), rot, 1, 1);
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 0, size);
      }
      const n1 = shiftPoint(center, rot, 1, size);
      if (!neutral) {
        terminals.N1 = n1;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        const n1p = shiftPoint(n1, rot, 1, 0.2);
        grounded.N1 = [n1p, n1];
      }
    } else if (windingIndex === 2) {
      center = shiftPoint(shiftPoint(center, rot, 0, -0.5), rot, 1, 1);
      if (!terminal1 && !terminal2) {
        terminals.T1 = shiftPoint(center, rot, 0, -size);
      }
      const n1 = shiftPoint(center, rot, 1, size);
      if (!neutral) {
        terminals.N1 = n1;
      } else if (neutral.getAttribute('cNodeName') === 'grounded') {
        const n1p = shiftPoint(n1, rot, 1, 0.2);
        grounded.N1 = [n1p, n1];
      }
    }
  }

  return { center, size, terminals, grounded, arc, zigZagTransform };
}

/** An open winding terminal a connection can end on. */
export type WindingTerminalTarget = {
  winding: Element;
  terminal: TransformerTerminalName;
  /** The terminal point on the winding. */
  near: Point;
  /** The point on the half-grid just outside the terminal, where wires arrive from. */
  far: Point;
};

/** How far (grid units) the cursor may be from a terminal to snap onto it. */
export const windingTargetReach = 0.35;

/** Terminals sit on the winding's axes, so the approach runs straight outward from the center. */
function approachPoint(center: Point, terminal: Point): Point {
  const [dx, dy] = [terminal[0] - center[0], terminal[1] - center[1]];
  const outward = (value: number, delta: number) =>
    delta > 0 ? Math.ceil(value * 2) / 2 : Math.floor(value * 2) / 2;
  return Math.abs(dx) > Math.abs(dy)
    ? [outward(terminal[0], dx), terminal[1]]
    : [terminal[0], outward(terminal[1], dy)];
}

/** Lists the terminals of `winding` that are still free to connect to. */
export function windingTerminalTargets(
  winding: Element,
  transformerPosition: Point,
  attrs: Pick<Attrs, 'rot' | 'kind' | 'flip'>,
): WindingTerminalTarget[] {
  const { center, terminals } = transformerWindingMeasures(
    winding,
    transformerPosition,
    attrs,
    '',
  );
  return (
    Object.entries(terminals) as [TransformerTerminalName, Point][]
  ).map(([terminal, near]) => ({
    winding,
    terminal,
    near,
    far: approachPoint(center, near),
  }));
}

/** The target closest to `cursor`, if any lies within {@link windingTargetReach}. */
export function nearestWindingTerminalTarget(
  targets: WindingTerminalTarget[],
  cursor: Point,
): WindingTerminalTarget | undefined {
  let nearest: WindingTerminalTarget | undefined;
  let nearestDistance = windingTargetReach;
  targets.forEach((target) => {
    const distance = Math.hypot(
      target.near[0] - cursor[0],
      target.near[1] - cursor[1],
    );
    if (distance <= nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  });
  return nearest;
}
