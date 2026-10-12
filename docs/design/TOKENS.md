# Marsfield Studio V2 Design Tokens

## Purpose and naming

Tokens create a shared implementation language. Components consume semantic tokens instead of embedding visual values. Use three layers: primitive (`--mf-color-neutral-950`), semantic (`--mf-surface-canvas`), and rare component aliases. Application code should prefer semantic tokens so themes can remap meaning consistently.

## Color

```css
:root {
  --mf-color-neutral-0: #ffffff;
  --mf-color-neutral-50: #f7f8fa;
  --mf-color-neutral-100: #eceff3;
  --mf-color-neutral-300: #b8c0cc;
  --mf-color-neutral-500: #707b8c;
  --mf-color-neutral-700: #364152;
  --mf-color-neutral-850: #18202d;
  --mf-color-neutral-900: #111722;
  --mf-color-neutral-950: #090d14;
  --mf-color-accent-400: #8b7cff;
  --mf-color-accent-500: #715cff;
  --mf-color-accent-600: #5a43e6;
  --mf-color-success-500: #2db883;
  --mf-color-warning-500: #e6a23c;
  --mf-color-danger-500: #e45d68;
  --mf-surface-canvas: var(--mf-color-neutral-950);
  --mf-surface-panel: var(--mf-color-neutral-900);
  --mf-surface-raised: var(--mf-color-neutral-850);
  --mf-surface-selected: color-mix(in srgb, var(--mf-color-accent-500) 18%, var(--mf-surface-raised));
  --mf-border-subtle: color-mix(in srgb, var(--mf-color-neutral-300) 18%, transparent);
  --mf-border-strong: color-mix(in srgb, var(--mf-color-neutral-300) 36%, transparent);
  --mf-text-primary: var(--mf-color-neutral-50);
  --mf-text-secondary: var(--mf-color-neutral-300);
  --mf-text-muted: var(--mf-color-neutral-500);
  --mf-action-primary: var(--mf-color-accent-500);
  --mf-focus-ring: var(--mf-color-accent-400);
  --mf-status-success: var(--mf-color-success-500);
  --mf-status-warning: var(--mf-color-warning-500);
  --mf-status-danger: var(--mf-color-danger-500);
}
```

Status never depends on color alone; text, iconography, and accessible names also communicate state.

## Typography

```css
:root {
  --mf-font-sans: Inter, ui-sans-serif, system-ui, sans-serif;
  --mf-font-mono: "JetBrains Mono", ui-monospace, monospace;
  --mf-text-xs: 0.75rem;
  --mf-text-sm: 0.875rem;
  --mf-text-md: 1rem;
  --mf-text-lg: 1.125rem;
  --mf-text-xl: 1.375rem;
  --mf-text-2xl: 1.75rem;
  --mf-leading-tight: 1.2;
  --mf-leading-normal: 1.5;
  --mf-weight-regular: 400;
  --mf-weight-medium: 500;
  --mf-weight-semibold: 600;
}
```

Use tabular numerals for cost, duration, progress, and generation metadata where changing width would distract.

## Space, size, and layout

```css
:root {
  --mf-space-1: 0.25rem;
  --mf-space-2: 0.5rem;
  --mf-space-3: 0.75rem;
  --mf-space-4: 1rem;
  --mf-space-5: 1.25rem;
  --mf-space-6: 1.5rem;
  --mf-space-8: 2rem;
  --mf-space-10: 2.5rem;
  --mf-space-12: 3rem;
  --mf-control-sm: 2rem;
  --mf-control-md: 2.5rem;
  --mf-control-lg: 3rem;
  --mf-touch-min: 2.75rem;
  --mf-inspector-width: 22rem;
  --mf-content-max: 90rem;
}
```

Use fluid sizing and container queries where component behavior depends on available space. Breakpoints are escape hatches, not separate product modes.

## Shape, elevation, layering, and motion

```css
:root {
  --mf-radius-sm: 0.375rem;
  --mf-radius-md: 0.625rem;
  --mf-radius-lg: 0.875rem;
  --mf-radius-xl: 1.25rem;
  --mf-radius-pill: 999px;
  --mf-shadow-raised: 0 8px 24px rgb(0 0 0 / 0.28);
  --mf-shadow-overlay: 0 18px 60px rgb(0 0 0 / 0.42);
  --mf-z-workspace: 0;
  --mf-z-panel: 10;
  --mf-z-popover: 30;
  --mf-z-dialog: 50;
  --mf-z-toast: 70;
  --mf-duration-fast: 120ms;
  --mf-duration-normal: 200ms;
  --mf-duration-slow: 320ms;
  --mf-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --mf-ease-emphasized: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

Motion explains state or spatial change and never delays input. Respect `prefers-reduced-motion`.

## Interaction and accessibility

```css
:root {
  --mf-opacity-disabled: 0.48;
  --mf-focus-width: 2px;
  --mf-focus-offset: 2px;
  --mf-drag-target-outline: 2px dashed var(--mf-action-primary);
}
```

Text and controls meet WCAG AA contrast. Focus remains visible on every semantic surface. Disabled appearance is paired with native semantics or appropriate ARIA state.

## Governance

- Add a token only for a reusable semantic decision.
- Do not name tokens after a page, provider, or temporary treatment.
- Document migrations when token meaning changes.
- Validate desktop, mobile, keyboard, reduced-motion, and high-contrast conditions.
- Keep provider branding outside the core semantic palette unless required.

