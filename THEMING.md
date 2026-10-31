# Theming

The SLD editor exposes its colours as CSS custom properties so a distro can
brand the diagram without forking.
Theming is based on the theming strategy outlined in the @openscd/oscd-api.
All declarations live in [`src/theme.ts`](src/theme.ts) (`sldThemeStyles`)
— the source of truth for this document.

Custom properties inherit through shadow DOM, so set any override on the
`<oscd-editor-sld>` element, a host shell, or `:root` and it cascades into the
diagram.

## Two-tier override

Every internal token resolves `var(--oscd-editor-sld-X, <fallback>)`. You can
theme at three levels of effort:

1. **Set theme pallete** — set `--oscd-theme-*` (primary, secondary, error,
   warning, base03…base3). The plugin picks these up automatically, the same way
   the shell does.
2. **Set the brand palette** — set `--oscd-editor-sld-red|yellow|blue` to
   retint every semantic token that derives from them.
3. **Fine-tune specific artifacts** — set a single `--oscd-editor-sld-*` hook to change just
   that artifact, leaving everything else on its default.

Generic surfaces and text follow `--md-sys-color-*` (with a foundation fallback)
and have no bespoke SLD token.

## Brand palette

| Public hook                | Default   | Affects                                                              |
| -------------------------- | --------- | -------------------------------------------------------------------- |
| `--oscd-editor-sld-red`    | `#bb1326` | Substation icon bg, terminals, invalid/unresolved cues               |
| `--oscd-editor-sld-yellow` | `#f5e214` | Voltage-level icon bg + frame, terminal outline, groundable terminal |
| `--oscd-editor-sld-blue`   | `#12579b` | Bay icon bg + frame, neutral terminals                               |

## Paper & ink

The structural diagram (canvas paper, busbars, connections, grounding, windings,
symbols) intentionally has no bespoke SLD token. It follows the standard Material
surface pairing directly:

- **paper** → `--md-sys-color-surface` (fallback `--oscd-base3`)
- **ink** → `--md-sys-color-on-surface` (fallback `--oscd-base03`)

The diagram sets `color: var(--md-sys-color-on-surface, …)`, so every
`currentColor` symbol follows the ink for free. To re-paper the diagram, theme
these via the shell (`--oscd-theme-*` / `--md-sys-color-*`) — sweeping the base
palette dark recolours the whole canvas with no SLD override.

## Semantic tokens

| Public hook                                             | Default                                       | Affects                              |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| `--oscd-editor-sld-icon-substation-background-color`    | brand red                                     | Substation entity icon background    |
| `--oscd-editor-sld-icon-substation-foreground-color`    | `--oscd-base3`                                | Substation entity icon glyph         |
| `--oscd-editor-sld-icon-voltage-level-background-color` | brand yellow                                  | Voltage-level entity icon background |
| `--oscd-editor-sld-icon-voltage-level-foreground-color` | `--md-sys-color-on-surface` → `--oscd-base00` | Voltage-level entity icon glyph      |
| `--oscd-editor-sld-icon-bay-background-color`           | brand blue                                    | Bay entity icon background           |
| `--oscd-editor-sld-icon-bay-foreground-color`           | `--oscd-base3`                                | Bay entity icon glyph                |
| `--oscd-editor-sld-voltage-level-color`                 | brand yellow                                  | Voltage-level frame outline          |
| `--oscd-editor-sld-bay-color`                           | brand blue                                    | Bay frame outline                    |
| `--oscd-editor-sld-invalid-placement-color`             | brand red                                     | Invalid placement highlight          |
| `--oscd-editor-sld-unresolved-reference-color`          | brand red                                     | Unresolved-reference highlight       |
| `--oscd-editor-sld-terminal-color`                      | brand red                                     | Terminals                            |
| `--oscd-editor-sld-neutral-terminal-color`              | brand blue                                    | Neutral terminals                    |
| `--oscd-editor-sld-terminal-outline-color`              | brand yellow                                  | Terminal outline                     |
| `--oscd-editor-sld-groundable-terminal-color`           | brand yellow                                  | Groundable terminal                  |
| `--oscd-editor-sld-grid-color`                          | `--oscd-base0`                                | Background placement grid            |
| `--oscd-editor-sld-label-placeholder-color`             | `--oscd-base1`                                | Empty label placeholder text         |
| `--oscd-editor-sld-routing-warning-color`               | `--oscd-warning`                              | Mark on connections drawn through other elements |

## Floating panels

The toolbar and coordinate tooltip float over the diagram on a translucent themed
surface (`color-mix` of `--md-sys-color-surface` at ≈87%, preserving the
pre-refactor look). Override the whole background per panel — a solid colour, a
different alpha, a gradient:

| Public hook                                  | Default                                                       | Affects                          |
| -------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| `--oscd-editor-sld-toolbar-background-color` | `color-mix(in srgb, var(--md-sys-color-surface) 87%, transparent)` | Toolbar background       |
| `--oscd-editor-sld-tooltip-background-color` | `color-mix(in srgb, var(--md-sys-color-surface) 87%, transparent)` | Coordinate-tooltip background |

To keep the diagram visible but adjust transparency, restate the mix with a
different percentage (e.g. `100%` for fully opaque); referencing
`--md-sys-color-surface` keeps it theme-aware.

## Export is monochrome

SVG export is intentionally black & white, regardless of the active theme:
`exportSVG` pins surface to white and all ink/semantic tokens to black. The one
exception is **label colours**, which are persisted SCL data (`color` attribute),
not theme-driven — they survive as colour. VL/Bay frames are not drawn in the
export by design. None of these tokens affect the exported colours.
