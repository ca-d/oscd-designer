import { nothing, type SVGTemplateResult } from 'lit';
import type { Point } from '../../foundations/geometry.js';
import type { SldSharedContext } from './artifact.js';
export type ConnectivityNodeContext = SldSharedContext & {
    mouseX: number;
    mouseY: number;
    mouseX2: number;
    mouseY2: number;
    /** Sections drawn elsewhere, e.g. as a live reroute preview. */
    hiddenSections?: Set<Element>;
    /** The connection being drawn, auto-routed to where it can meet `cNode`. */
    routeToConnectivityNode?: (path: Point[], cNode: Element) => Point[] | undefined;
};
export declare function renderConnectivityNode(cNode: Element, context: ConnectivityNodeContext): SVGTemplateResult | typeof nothing;
