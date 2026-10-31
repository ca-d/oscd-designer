import { css } from 'lit';

/**
 * Themeable colour tokens for the SLD editor.
 *
 * The model mirrors `@omicronenergy/oscd-shell` (see its THEMING.md):
 *
 * 1. **Foundation palette** — our internal `--oscd-base03 … --oscd-base3`,
 *    `--oscd-primary`, `--oscd-secondary`, `--oscd-error`/`--oscd-warning` are
 *    initialised from the host's public `--oscd-theme-*` tokens, falling back
 *    to the documented oscd-shell defaults. This makes the plugin pick up a
 *    distro's theme when embedded in the shell, yet still render sensibly when
 *    used standalone (where the shell's tokens are absent).
 *
 * 2. **SLD brand palette** — `--oscd-sld-red|yellow|blue`, the diagram's own
 *    identity colours, overridable via the public `--oscd-editor-sld-*` hooks.
 *
 * 3. **SLD semantic tokens** — what the components actually consume, named for
 *    their role and each resolving (public hook → brand/foundation token) so
 *    they can be retuned individually or swept via the palette.
 *
 * Generic surfaces and text are *not* given bespoke SLD tokens: components
 * reference the standard `--md-sys-color-*` variables directly, with a
 * foundation-token fallback for standalone use.
 *
 * Included in each top-level component's `static styles` so the tokens resolve
 * the same whether a component is used inside the editor or on its own; custom
 * properties inherit through shadow DOM, so an override set above any of them
 * still wins.
 */
/**
 * Every colour token declared by {@link sldThemeStyles}. The export serialiser
 * pins each one's runtime-resolved value onto the exported SVG root so the
 * standalone file's `var()` references keep their (possibly distro-themed)
 * values. Kept here as the single source of truth next to the declarations —
 * an all-or-nothing dump; a few unused tokens cost nothing and beat curating.
 */
export const sldThemeTokens = [
  '--oscd-primary',
  '--oscd-secondary',
  '--oscd-base03',
  '--oscd-base02',
  '--oscd-base01',
  '--oscd-base00',
  '--oscd-base0',
  '--oscd-base1',
  '--oscd-base2',
  '--oscd-base3',
  '--oscd-error',
  '--oscd-warning',
  '--oscd-sld-red',
  '--oscd-sld-yellow',
  '--oscd-sld-blue',
  '--oscd-sld-icon-substation-background-color',
  '--oscd-sld-icon-substation-foreground-color',
  '--oscd-sld-icon-voltage-level-background-color',
  '--oscd-sld-icon-voltage-level-foreground-color',
  '--oscd-sld-icon-bay-background-color',
  '--oscd-sld-icon-bay-foreground-color',
  '--oscd-sld-voltage-level-color',
  '--oscd-sld-bay-color',
  '--oscd-sld-invalid-placement-color',
  '--oscd-sld-unresolved-reference-color',
  '--oscd-sld-terminal-color',
  '--oscd-sld-neutral-terminal-color',
  '--oscd-sld-terminal-outline-color',
  '--oscd-sld-groundable-terminal-color',
  '--oscd-sld-grid-color',
  '--oscd-sld-label-placeholder-color',
  '--oscd-sld-routing-warning-color',
];

export const sldThemeStyles = css`
  :host {
    /* foundation palette — initialised from the host oscd-theme tokens */
    --oscd-primary: var(--oscd-theme-primary, #0b335b);
    --oscd-secondary: var(--oscd-theme-secondary, #2485e5);
    --oscd-base03: var(--oscd-theme-base03, #121417);
    --oscd-base02: var(--oscd-theme-base02, #1a1e23);
    --oscd-base01: var(--oscd-theme-base01, #3d4651);
    --oscd-base00: var(--oscd-theme-base00, #46505d);
    --oscd-base0: var(--oscd-theme-base0, #8b97a7);
    --oscd-base1: var(--oscd-theme-base1, #96a1b0);
    --oscd-base2: var(--oscd-theme-base2, #f3f5f6);
    --oscd-base3: var(--oscd-theme-base3, white);
    --oscd-error: var(--oscd-theme-error, #dc322f);
    --oscd-warning: var(--oscd-theme-warning, #b58900);

    /* SLD brand palette (diagram identity) */
    --oscd-sld-red: var(--oscd-editor-sld-red, #bb1326);
    --oscd-sld-yellow: var(--oscd-editor-sld-yellow, #f5e214);
    --oscd-sld-blue: var(--oscd-editor-sld-blue, #12579b);

    /* SLD semantic tokens */
    --oscd-sld-toolbar-background-color: var(
      --oscd-editor-sld-toolbar-background-color,
      color-mix(in srgb, var(--md-sys-color-surface, var(--oscd-base3)) 87%, transparent)
    );
    --oscd-sld-tooltip-background-color: var(
      --oscd-editor-sld-tooltip-background-color,
      color-mix(in srgb, var(--md-sys-color-surface, var(--oscd-base3)) 87%, transparent)
    );

    --oscd-sld-icon-substation-background-color: var(
      --oscd-editor-sld-icon-substation-background-color,
      var(--oscd-sld-red)
    );
    --oscd-sld-icon-substation-foreground-color: var(
      --oscd-editor-sld-icon-substation-foreground-color,
      var(--oscd-base3)
    );
    --oscd-sld-icon-voltage-level-background-color: var(
      --oscd-editor-sld-icon-voltage-level-background-color,
      var(--oscd-sld-yellow)
    );
    --oscd-sld-icon-voltage-level-foreground-color: var(
      --oscd-editor-sld-icon-voltage-level-foreground-color,
      var(--md-sys-color-on-surface, var(--oscd-base00))
    );
    --oscd-sld-icon-bay-background-color: var(
      --oscd-editor-sld-icon-bay-background-color,
      var(--oscd-sld-blue)
    );
    --oscd-sld-icon-bay-foreground-color: var(
      --oscd-editor-sld-icon-bay-foreground-color,
      var(--oscd-base3)
    );

    --oscd-sld-voltage-level-color: var(
      --oscd-editor-sld-voltage-level-color,
      var(--oscd-sld-yellow)
    );
    --oscd-sld-bay-color: var(
      --oscd-editor-sld-bay-color,
      var(--oscd-sld-blue)
    );

    --oscd-sld-invalid-placement-color: var(
      --oscd-editor-sld-invalid-placement-color,
      var(--oscd-sld-red)
    );
    --oscd-sld-unresolved-reference-color: var(
      --oscd-editor-sld-unresolved-reference-color,
      var(--oscd-sld-red)
    );

    --oscd-sld-terminal-color: var(
      --oscd-editor-sld-terminal-color,
      var(--oscd-sld-red)
    );
    --oscd-sld-neutral-terminal-color: var(
      --oscd-editor-sld-neutral-terminal-color,
      var(--oscd-sld-blue)
    );
    --oscd-sld-terminal-outline-color: var(
      --oscd-editor-sld-terminal-outline-color,
      var(--oscd-sld-yellow)
    );
    --oscd-sld-groundable-terminal-color: var(
      --oscd-editor-sld-groundable-terminal-color,
      var(--oscd-sld-yellow)
    );

    --oscd-sld-grid-color: var(
      --oscd-editor-sld-grid-color,
      var(--oscd-base0)
    );
    --oscd-sld-label-placeholder-color: var(
      --oscd-editor-sld-label-placeholder-color,
      var(--oscd-base1)
    );
    --oscd-sld-routing-warning-color: var(
      --oscd-editor-sld-routing-warning-color,
      var(--oscd-warning)
    );
  }
`;
