/**
 * Pure constructors for each {@link InteractionState} variant. They compute the next
 * interaction *value* only — no DOM, no events, no promises. Side-effecting
 * orchestration (event dispatch, placement promises, `disabled` guards) stays
 * on the host component, which simply assigns the result.
 *
 * Reserved as a possible future step: if transition guards accumulate (e.g.
 * "only append a point while connecting"), these could be folded into a single
 * `transition(state, action)` reducer. Avoided for now (YAGNI) — the union plus
 * these one-line constructors already give free exclusivity and call-site
 * narrowing without the extra machinery.
 */
export const idle = () => ({ mode: 'idle' });
/**
 * The read-only resting state. Like {@link idle} it is not a gesture, but unlike
 * `idle` it exposes **no** interaction affordances at all: ports, resize
 * handles, context menus and click-to-place targets are all suppressed, so a
 * viewer in this mode is a truly static, non-dispatching read-only diagram. It
 * is the viewer's default; the editor never enters it.
 */
export const locked = () => ({ mode: 'locked' });
export const placing = (element, offset) => ({
    mode: 'placing',
    element,
    offset,
});
export const placingLabel = (element, offset) => ({
    mode: 'placingLabel',
    element,
    offset,
});
export const resizingBR = (element) => ({
    mode: 'resizingBR',
    element,
});
export const resizingTL = (element) => ({
    mode: 'resizingTL',
    element,
});
export const connectingFrom = (element, terminal, path = [], replacing) => ({
    mode: 'connectingFrom',
    element,
    terminal,
    path,
    ...(replacing ? { replacing } : {}),
});
/** Moving the wire `section` by placing a new point on its way. */
export const reroutingSection = (element) => ({
    mode: 'reroutingSection',
    element,
});
/**
 * Pure selectors that read an {@link InteractionState} without re-fanning it out
 * into independent fields. They keep the union the single source of truth: the
 * viewer and the drawing artifacts ask these questions of the one `interaction`
 * value, so illegal combinations stay unrepresentable all the way down.
 *
 * - {@link isMode} answers "which gesture is active?" (mode-only).
 * - {@link targetInMode} answers "is *this* element the subject of gesture X?"
 *   (identity checks are mode-specific, hence the mode argument).
 * - {@link connectDetail} exposes the connect-from payload while connecting.
 */
export function isMode(state, ...modes) {
    return modes.includes(state.mode);
}
export function targetInMode(state, ...modes) {
    return 'element' in state && modes.includes(state.mode)
        ? state.element
        : undefined;
}
export function connectDetail(state) {
    return state.mode === 'connectingFrom'
        ? { from: state.element, path: state.path, fromTerminal: state.terminal }
        : undefined;
}
//# sourceMappingURL=interaction-mode.js.map