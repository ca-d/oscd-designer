/**
 * Resizing a bus bar without disconnecting what is attached to it.
 *
 * A bus bar is a run of thick sections along a straight line, cut wherever a
 * feeder joins. Where the bus bar no longer reaches a feeder, the part of the
 * line in between becomes thin wire instead, so the feeder stays connected; and
 * where the bus bar grows over such wire again, that wire becomes thick again.
 */

import { sldNs } from '../foundations.js';
import { busSections, isBusBar } from './connectivity.js';
import { updateSLDAttributes } from './sld-attribute-edits.js';
import { attributes, setSLDAttributes } from './sld-attributes.js';

import type { EditV2 } from '@openscd/oscd-api';
import type { Point } from './geometry.js';

const EPSILON = 1e-9;

type Axis = 0 | 1;

/** A section and where it lies along the line of the bus bar. */
type Run = {
  section: Element;
  vertices: Element[];
  points: Point[];
  from: number;
  to: number;
};

const sameAs = (a: number, b: number) => Math.abs(a - b) < EPSILON;

const axisOf = (a: Point, b: Point): Axis | undefined => {
  if (a[1] === b[1] && a[0] !== b[0]) {
    return 0;
  }
  return a[0] === b[0] && a[1] !== b[1] ? 1 : undefined;
};

function newVertex(doc: Document, nsp: string, [x, y]: Point): Element {
  const vertex = doc.createElementNS(sldNs, `${nsp}:Vertex`);
  setSLDAttributes(vertex, nsp, { x: x.toString(), y: y.toString() });
  return vertex;
}

function newBusSection(doc: Document, nsp: string, points: Point[]): Element {
  const section = doc.createElementNS(sldNs, `${nsp}:Section`);
  setSLDAttributes(section, nsp, { bus: 'true' });
  points.forEach(point => section.appendChild(newVertex(doc, nsp, point)));
  return section;
}

/**
 * Cuts a run at `at`, strictly inside it. The run keeps the part before; the
 * part after is kept as a new thin section when `keepTail`.
 */
function cutRun(
  { section, vertices, points }: Run,
  axis: Axis,
  at: number,
  keepTail: boolean,
  nsp: string,
): EditV2[] {
  const doc = section.ownerDocument;
  const next = points.findIndex(point => point[axis] >= at - EPSILON);
  const exact = sameAs(points[next][axis], at);
  const cut: Point = [...points[next]];
  cut[axis] = at;

  const edits: EditV2[] = vertices
    .slice(exact ? next + 1 : next)
    .map(vertex => ({ node: vertex }));
  if (!exact) {
    edits.push({
      parent: section,
      node: newVertex(doc, nsp, cut),
      reference: null,
    });
  }
  if (keepTail) {
    const tail = section.cloneNode(false) as Element;
    tail.removeAttributeNS(sldNs, 'bus');
    [cut, ...points.slice(exact ? next + 1 : next)].forEach(point =>
      tail.appendChild(newVertex(doc, nsp, point)),
    );
    edits.push({
      parent: section.parentElement!,
      node: tail,
      reference: section.nextElementSibling,
    });
  }
  return edits;
}

/**
 * Edits that resize the bus bar of `element` so that it ends at `(x, y)`,
 * keeping every feeder connected.
 */
export function busBarVertexEdits(
  element: Element,
  x: number,
  y: number,
  nsp: string,
): EditV2[] {
  const bay = element.localName === 'Vertex' ? element.closest('Bay') : null;
  if (!bay || !isBusBar(bay)) {
    return [];
  }

  const buses = busSections(bay);
  const cNode = buses[0].closest('ConnectivityNode')!;
  const pointsOf = (section: Element) =>
    Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex')).map(
      vertex => attributes(vertex).pos,
    );
  const firstPoints = pointsOf(buses[0]);
  const lastPoints = pointsOf(buses[buses.length - 1]);
  const start = firstPoints[0];
  const end = lastPoints[lastPoints.length - 1];
  const target: Point = [x, y];

  const edits: EditV2[] = [
    updateSLDAttributes(bay, nsp, {
      w: (x - start[0] + 1).toString(),
      h: (y - start[1] + 1).toString(),
    }),
  ];
  const newAxis = axisOf(start, target);
  if (newAxis === undefined) {
    return edits;
  }
  const axis = axisOf(start, end) ?? newAxis;
  const across = (1 - axis) as Axis;
  const onLine = (point: Point) => sameAs(point[across], start[across]);
  const t0 = start[axis];
  const tOld = end[axis];

  const runs = Array.from(cNode.getElementsByTagNameNS(sldNs, 'Section')).map(
    (section): Run => {
      const vertices = Array.from(
        section.getElementsByTagNameNS(sldNs, 'Vertex'),
      );
      const points = vertices.map(vertex => attributes(vertex).pos);
      const along = points.map(point => point[axis]);
      return {
        section,
        vertices,
        points,
        from: Math.min(...along),
        to: Math.max(...along),
      };
    },
  );
  const busRuns = runs
    .filter(r => buses.includes(r.section))
    .sort((a, b) => a.from - b.from);

  // The wire that carries on along the line from the end of the bus bar.
  const chain = [...busRuns];
  let chainEnd = tOld;
  for (let next = true; next; ) {
    const run = runs.find(
      r =>
        !chain.includes(r) &&
        r.points.every(onLine) &&
        sameAs(r.from, chainEnd) &&
        r.to > chainEnd,
    );
    next = !!run;
    if (run) {
      chain.push(run);
      chainEnd = run.to;
    }
  }
  const thinRuns = chain.filter(r => !busRuns.includes(r));

  // The furthest place along the line where something else joins.
  const furthestJoin = Math.max(
    t0,
    ...runs
      .filter(r => !chain.includes(r))
      .flatMap(r => r.points)
      .filter(
        point =>
          onLine(point) &&
          point[axis] >= t0 - EPSILON &&
          point[axis] <= chainEnd + EPSILON,
      )
      .map(point => point[axis]),
  );

  /** Thins the bus bar beyond `keep` as far as a feeder needs it, and removes the rest. */
  const thinBeyond = (keep: number) => {
    const needed = furthestJoin > keep + EPSILON;
    busRuns.forEach((r) => {
      if (r.to <= keep + EPSILON) {
        return;
      }
      if (r.from >= keep - EPSILON) {
        edits.push(
          needed && r.from < furthestJoin - EPSILON
            ? updateSLDAttributes(r.section, nsp, { bus: null })
            : { node: r.section },
        );
      } else {
        edits.push(...cutRun(r, axis, keep, needed, nsp));
      }
    });
  };

  if (newAxis !== axis) {
    // The bus bar turns about its start, leaving the old line as wire.
    if (furthestJoin > t0 + EPSILON) {
      thinBeyond(t0);
      edits.push({
        parent: busRuns[0].section.parentElement!,
        node: newBusSection(busRuns[0].section.ownerDocument, nsp, [
          start,
          target,
        ]),
        reference: busRuns[0].section.parentElement!.firstElementChild,
      });
    } else {
      const [turning, ...others] = busRuns;
      edits.push(
        ...turning.vertices.slice(2).map(vertex => ({ node: vertex })),
        updateSLDAttributes(turning.vertices[1], nsp, {
          x: x.toString(),
          y: y.toString(),
        }),
        ...others.map(r => ({ node: r.section })),
      );
    }
    return edits;
  }

  const tNew = target[axis];
  if (tNew < tOld - EPSILON) {
    thinBeyond(tNew);
    return edits;
  }
  if (tNew <= tOld + EPSILON) {
    return edits;
  }

  // Growing: wire in the way becomes bus bar, then the line is extended.
  let busEnd = tOld;
  let lastRun = busRuns[busRuns.length - 1];
  for (const r of thinRuns) {
    if (r.to <= tNew + EPSILON) {
      edits.push(updateSLDAttributes(r.section, nsp, { bus: 'true' }));
    } else if (r.from < tNew - EPSILON) {
      edits.push(
        updateSLDAttributes(r.section, nsp, { bus: 'true' }),
        ...cutRun(r, axis, tNew, true, nsp),
      );
    } else {
      break;
    }
    busEnd = Math.min(r.to, tNew);
    lastRun = r;
  }
  if (busEnd < tNew - EPSILON) {
    const joined = runs.some(
      r =>
        r !== lastRun &&
        r.points.some(point => onLine(point) && sameAs(point[axis], busEnd)),
    );
    if (joined) {
      const from: Point = [...start];
      from[axis] = busEnd;
      edits.push({
        parent: lastRun.section.parentElement!,
        node: newBusSection(lastRun.section.ownerDocument, nsp, [from, target]),
        reference: lastRun.section.nextElementSibling,
      });
    } else {
      edits.push(
        updateSLDAttributes(lastRun.vertices[lastRun.vertices.length - 1], nsp, {
          x: x.toString(),
          y: y.toString(),
        }),
      );
    }
  }
  return edits;
}
