/**
 * SLD placement and resize validation rules.
 *
 * These encode the domain-specific logic for whether an SCL element can
 * legally occupy a given position or size on the SLD grid. They know about
 * the SLD topology (parent/child containment hierarchy, bus bar exemptions,
 * IED references occupying grid space, etc.).
 */
/** A VoltageLevel or Bay that has not been sized yet, so it can be dragged out. */
export declare function isUnsizedContainer(element: Element): boolean;
export declare function canPlaceAt(root: Element, element: Element, x: number, y: number, w: number, h: number): boolean;
export declare function canResizeTo(root: Element, element: Element, w: number, h: number): boolean;
export declare function canResizeToTL(root: Element, element: Element, x: number, y: number, w: number, h: number): boolean;
