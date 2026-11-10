import { type TemplateResult } from 'lit';
import { type ConnectTarget } from '../../foundations/connectivity.js';
import type { Point } from '../../foundations/geometry.js';
import { type Highlight } from './highlight.js';
import { type SldArtifactDescriptor, type SldSharedContext } from './artifact.js';
export type PowerTransformerContext = SldSharedContext & {
    connectTarget: ConnectTarget | undefined;
    groundTerminal(element: Element, terminal: 'T1' | 'T2' | 'N1' | 'N2'): void;
    highlight: Highlight[];
    mouseX: number;
    mouseY: number;
};
type PowerTransformerRenderState = {
    clickthrough: boolean;
    disabled: boolean;
    highlight: TemplateResult | '';
    placingSelf: boolean;
    position: Point;
    selectable: boolean;
    windings: Element[];
};
type PowerTransformerRenderActions = {
    onAuxClick: (event: MouseEvent) => void;
    onClick: ((event: MouseEvent) => void) | symbol;
};
export declare const powerTransformerArtifact: SldArtifactDescriptor<PowerTransformerRenderState, PowerTransformerRenderActions, PowerTransformerContext>;
export {};
