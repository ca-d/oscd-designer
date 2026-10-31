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
export declare function transformerWindingMeasures(winding: Element, transformerPosition: Point, { rot, kind, flip }: Pick<Attrs, 'rot' | 'kind' | 'flip'>, twoWindingEarthingZigZagTransform: string): TransformerWindingMeasures;
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
export declare const windingTargetReach = 0.35;
/** Lists the terminals of `winding` that are still free to connect to. */
export declare function windingTerminalTargets(winding: Element, transformerPosition: Point, attrs: Pick<Attrs, 'rot' | 'kind' | 'flip'>): WindingTerminalTarget[];
/** The target closest to `cursor`, if any lies within {@link windingTargetReach}. */
export declare function nearestWindingTerminalTarget(targets: WindingTerminalTarget[], cursor: Point): WindingTerminalTarget | undefined;
