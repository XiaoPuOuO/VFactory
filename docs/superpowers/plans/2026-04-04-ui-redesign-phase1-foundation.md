# UI Redesign Phase 1: Foundation & Core Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current zero-chroma grayscale CSS tokens with a warm blue-purple brand system, establish a reusable `@paperclipai/design-system` CSS package, add Inter font, update border-radius from 0 to 8px, and refactor all core UI components with new tokens + animation.

**Architecture:** Create `packages/design-system/` as a CSS-only workspace package (`@paperclipai/design-system`). Note: the existing `ui/package.json` already uses `@paperclipai/ui` as its name, so the design system uses a distinct name to avoid collision. It exports `tokens.css` (design tokens), `base.css` (reset + font), and component CSS files. The existing `ui/src/index.css` is refactored to import from this package instead of defining tokens inline. All existing `data-slot` selectors continue to work — we're changing values, not structure.

**Scope note:** This plan covers Phase 1 (tokens + base) and the highest-impact Phase 2 components (14 of ~22). The remaining components (Checkbox, Switch, Table, Avatar, DropdownMenu, Command, Progress, IconButton) and the layout primitives (Container, Stack, Grid, SplitPanel) will be addressed in a follow-up plan for Phase 2 completion.

**Tech Stack:** Vanilla CSS (oklch color space), CSS custom properties, CSS @keyframes animations, Inter variable font (woff2), pnpm workspace

---

## File Structure

### New files (packages/design-system/)

```
paperclip-official/packages/design-system/
├── package.json                          ← @paperclipai/design-system npm package
├── src/
│   ├── index.css                         ← Entry: @import all layers in order
│   ├── tokens.css                        ← Layer 0: All design tokens
│   ├── base.css                          ← Layer 1: Reset, font-face, focus, scrollbar
│   ├── animations.css                    ← Shared @keyframes + animation utilities
│   └── components/
│       ├── button.css                    ← Button refactored styles
│       ├── input.css                     ← Input/Textarea/Select styles
│       ├── card.css                      ← Card with hover animation
│       ├── badge.css                     ← Badge semantic variants
│       ├── dialog.css                    ← Dialog enter/exit animation
│       ├── sheet.css                     ← Sheet slide animation
│       ├── toast.css                     ← Toast slide-in + auto-dismiss
│       ├── skeleton.css                  ← Skeleton shimmer
│       ├── spinner.css                   ← Brand-color spinner
│       ├── inline-alert.css              ← 4-variant inline alerts
│       ├── empty-state.css               ← Rich empty state layout
│       ├── popover.css                   ← Popover scale+fade
│       ├── tabs.css                      ← Tabs with underline slide
│       └── tooltip.css                   ← Tooltip styling
```

### Modified files

```
paperclip-official/ui/src/index.css                ← Refactor: remove inline tokens, import @paperclipai/ui
paperclip-official/ui/src/styles/ui.css             ← Remove component styles migrated to design-system
paperclip-official/pnpm-workspace.yaml              ← (no change needed, packages/* already included)
paperclip-official/ui/package.json                  ← Add @paperclipai/ui dependency
```

---

### Task 1: Create package structure and tokens.css

**Files:**
- Create: `packages/design-system/package.json`
- Create: `packages/design-system/src/tokens.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@paperclipai/design-system",
  "version": "0.1.0",
  "private": true,
  "description": "Paperclip Design System — Design Tokens + UI Component CSS",
  "main": "src/index.css",
  "exports": {
    ".": "./src/index.css",
    "./tokens": "./src/tokens.css",
    "./base": "./src/base.css"
  },
  "keywords": ["paperclip", "design-system", "css"]
}
```

- [ ] **Step 2: Write tokens.css with all design tokens**

```css
/**
 * Paperclip Design Tokens
 * All visual primitives: colors, typography, spacing, radius, shadow, z-index, animation.
 * oklch color space for perceptual uniformity.
 */

:root {
  /* ===== Color: Brand Primary (hue 270 blue-purple) ===== */
  --color-primary-50:  oklch(0.97  0.015 270);
  --color-primary-100: oklch(0.93  0.04  270);
  --color-primary-200: oklch(0.82  0.10  270);
  --color-primary-300: oklch(0.70  0.18  270);
  --color-primary-400: oklch(0.65  0.20  270);
  --color-primary-500: oklch(0.55  0.24  270);
  --color-primary-600: oklch(0.48  0.23  270);
  --color-primary-700: oklch(0.45  0.22  270);
  --color-primary-900: oklch(0.35  0.18  270);

  /* ===== Color: Neutral (hue 270 tinted grays) ===== */
  --color-neutral-50:  oklch(0.985 0.005 270);
  --color-neutral-100: oklch(0.96  0.008 270);
  --color-neutral-200: oklch(0.92  0.010 270);
  --color-neutral-300: oklch(0.85  0.012 270);
  --color-neutral-400: oklch(0.70  0.015 270);
  --color-neutral-500: oklch(0.55  0.015 270);
  --color-neutral-600: oklch(0.45  0.015 270);
  --color-neutral-700: oklch(0.40  0.015 270);
  --color-neutral-800: oklch(0.28  0.015 270);
  --color-neutral-900: oklch(0.20  0.015 270);
  --color-neutral-950: oklch(0.145 0.015 270);

  /* ===== Color: Semantic (soft) ===== */
  --color-success-text:   oklch(0.48 0.15 145);
  --color-success-bg:     oklch(0.93 0.06 145);
  --color-success-border: oklch(0.86 0.08 145);

  --color-warning-text:   oklch(0.58 0.14 75);
  --color-warning-bg:     oklch(0.95 0.05 85);
  --color-warning-border: oklch(0.88 0.08 85);

  --color-error-text:     oklch(0.50 0.16 25);
  --color-error-bg:       oklch(0.95 0.04 25);
  --color-error-border:   oklch(0.88 0.07 25);

  --color-info-text:      oklch(0.52 0.13 235);
  --color-info-bg:        oklch(0.95 0.04 235);
  --color-info-border:    oklch(0.88 0.07 235);

  /* ===== Typography ===== */
  --font-sans: 'Inter var', 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI",
               "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code',
               ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-2xs:  0.625rem;
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;

  --leading-tight:   1.25;
  --leading-normal:  1.5;
  --leading-relaxed: 1.7;

  /* ===== Spacing (4px base) ===== */
  --space-px2: 0.125rem;
  --space-1:   0.25rem;
  --space-2:   0.5rem;
  --space-3:   0.75rem;
  --space-4:   1rem;
  --space-5:   1.25rem;
  --space-6:   1.5rem;
  --space-8:   2rem;
  --space-10:  2.5rem;
  --space-12:  3rem;
  --space-16:  4rem;
  --space-20:  5rem;

  /* ===== Border Radius ===== */
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-full: 9999px;

  /* ===== Shadow ===== */
  --shadow-xs: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-sm: 0 1px 3px 0 oklch(0 0 0 / 0.08), 0 1px 2px -1px oklch(0 0 0 / 0.06);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.08), 0 2px 4px -2px oklch(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.08), 0 4px 6px -4px oklch(0 0 0 / 0.04);
  --shadow-xl: 0 20px 25px -5px oklch(0 0 0 / 0.08), 0 8px 10px -6px oklch(0 0 0 / 0.04);

  /* ===== Z-Index ===== */
  --z-sidebar: 40;
  --z-dialog:  50;
  --z-toast:   2147483647;

  /* ===== Animation ===== */
  --duration-fast:   120ms;
  --duration-normal: 200ms;
  --duration-slow:   350ms;
  --duration-spring: 500ms;

  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);
  --ease-out:     cubic-bezier(0, 0, 0.2, 1);
  --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ===== Semantic Aliases (light mode) ===== */
  color-scheme: light;
  --radius: var(--radius-md);

  --background:          var(--color-neutral-50);
  --foreground:          var(--color-neutral-900);
  --card:                white;
  --card-foreground:     var(--color-neutral-900);
  --popover:             white;
  --popover-foreground:  var(--color-neutral-900);
  --primary:             var(--color-primary-500);
  --primary-foreground:  white;
  --secondary:           var(--color-neutral-100);
  --secondary-foreground: var(--color-neutral-900);
  --muted:               var(--color-neutral-100);
  --muted-foreground:    var(--color-neutral-500);
  --accent:              var(--color-neutral-100);
  --accent-foreground:   var(--color-neutral-900);
  --destructive:         var(--color-error-text);
  --destructive-foreground: white;
  --border:              var(--color-neutral-200);
  --input:               var(--color-neutral-200);
  --ring:                var(--color-primary-500);

  /* Chart colors */
  --chart-1: oklch(0.55 0.24 270);
  --chart-2: oklch(0.60 0.18 145);
  --chart-3: oklch(0.58 0.14 75);
  --chart-4: oklch(0.52 0.13 235);
  --chart-5: oklch(0.50 0.16 25);

  /* Sidebar */
  --sidebar:                 var(--color-neutral-950);
  --sidebar-foreground:      oklch(0.985 0.005 270);
  --sidebar-primary:         var(--color-primary-500);
  --sidebar-primary-foreground: white;
  --sidebar-accent:          oklch(0.22 0.015 270);
  --sidebar-accent-foreground: oklch(0.985 0.005 270);
  --sidebar-border:          oklch(0.25 0.015 270);
  --sidebar-ring:            var(--color-primary-500);
}

/* ===== Dark Mode ===== */
.dark {
  color-scheme: dark;

  --background:           var(--color-neutral-950);
  --foreground:           oklch(0.985 0.005 270);
  --card:                 oklch(0.20 0.015 270);
  --card-foreground:      oklch(0.985 0.005 270);
  --popover:              oklch(0.20 0.015 270);
  --popover-foreground:   oklch(0.985 0.005 270);
  --primary:              var(--color-primary-400);
  --primary-foreground:   oklch(0.15 0.015 270);
  --secondary:            var(--color-neutral-800);
  --secondary-foreground: oklch(0.985 0.005 270);
  --muted:                var(--color-neutral-800);
  --muted-foreground:     oklch(0.65 0.015 270);
  --accent:               var(--color-neutral-800);
  --accent-foreground:    oklch(0.985 0.005 270);
  --destructive:          oklch(0.60 0.20 25);
  --destructive-foreground: oklch(0.985 0.005 270);
  --border:               var(--color-neutral-800);
  --input:                var(--color-neutral-800);
  --ring:                 var(--color-primary-400);

  --chart-1: oklch(0.65 0.22 270);
  --chart-2: oklch(0.65 0.17 145);
  --chart-3: oklch(0.70 0.15 75);
  --chart-4: oklch(0.60 0.14 235);
  --chart-5: oklch(0.60 0.18 25);

  --sidebar:                 var(--color-neutral-950);
  --sidebar-foreground:      oklch(0.985 0.005 270);
  --sidebar-primary:         var(--color-primary-400);
  --sidebar-primary-foreground: white;
  --sidebar-accent:          oklch(0.22 0.015 270);
  --sidebar-accent-foreground: oklch(0.985 0.005 270);
  --sidebar-border:          oklch(0.25 0.015 270);
  --sidebar-ring:            var(--color-primary-400);

  /* Deeper shadows in dark mode */
  --shadow-xs: 0 1px 2px 0 oklch(0 0 0 / 0.20);
  --shadow-sm: 0 1px 3px 0 oklch(0 0 0 / 0.25), 0 1px 2px -1px oklch(0 0 0 / 0.20);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.30), 0 2px 4px -2px oklch(0 0 0 / 0.20);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.30), 0 4px 6px -4px oklch(0 0 0 / 0.20);
  --shadow-xl: 0 20px 25px -5px oklch(0 0 0 / 0.35), 0 8px 10px -6px oklch(0 0 0 / 0.25);
}
```

- [ ] **Step 3: Verify file exists**

Run: `ls -la paperclip-official/packages/design-system/src/tokens.css`
Expected: file exists

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/
git commit -m "feat(design-system): create package structure and tokens.css

Complete design token definitions: brand colors (blue-purple hue 270),
tinted neutral grays, soft semantic colors, typography scale, spacing
system, border-radius, shadows, z-index, and animation tokens.
Light + dark mode semantic aliases."
```

---

### Task 2: Write base.css (reset, font-face, focus, scrollbar)

**Files:**
- Create: `packages/design-system/src/base.css`

- [ ] **Step 1: Write base.css**

```css
/**
 * Paperclip Base — Global reset, font loading, focus styles, scrollbar, reduced-motion.
 * Depends on tokens.css being loaded first.
 */

/* ===== Inter Variable Font ===== */
@font-face {
  font-family: 'Inter var';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://rsms.me/inter/font-files/InterVariable.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter var';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url('https://rsms.me/inter/font-files/InterVariable-Italic.woff2') format('woff2');
}

/* ===== Global Reset ===== */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

* {
  border-color: var(--border);
}

html {
  height: 100%;
  -webkit-tap-highlight-color: color-mix(in oklab, var(--foreground) 20%, transparent);
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  font-feature-settings: 'cv11' 1, 'ss01' 1; /* Inter: alt glyphs */
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  background: var(--background);
  color: var(--foreground);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  height: 100%;
  overflow: hidden;
}

h1, h2, h3, h4, h5, h6 {
  text-wrap: balance;
  line-height: var(--leading-tight);
}

a,
button,
[role="button"],
input,
select,
textarea,
label {
  touch-action: manipulation;
}

/* ===== Accessible Touch Targets ===== */
@media (pointer: coarse) {
  button,
  [role="button"],
  input,
  select,
  textarea,
  [data-slot="select-trigger"] {
    min-height: 44px;
  }
}

/* ===== Focus Visible — Brand-color ring ===== */
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

/* Remove default outline for pointer users who click */
:focus:not(:focus-visible) {
  outline: none;
}

/* ===== Toast Viewport ===== */
[data-toast-viewport] {
  position: fixed;
  inset: 0;
  z-index: var(--z-toast) !important;
  pointer-events: none;
}

/* ===== Scrollbar ===== */
*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: var(--color-neutral-300);
  border-radius: var(--radius-full);
  transition: background var(--duration-fast) ease;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--color-neutral-500);
}

*::-webkit-scrollbar-thumb:active {
  background: var(--color-neutral-600);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-neutral-300) transparent;
}

.dark *::-webkit-scrollbar-thumb {
  background: oklch(0.38 0.015 270);
}

.dark *::-webkit-scrollbar-thumb:hover {
  background: oklch(0.48 0.015 270);
}

.dark *::-webkit-scrollbar-thumb:active {
  background: oklch(0.55 0.015 270);
}

.dark * {
  scrollbar-color: oklch(0.38 0.015 270) transparent;
}

/* Auto-hide scrollbar: transparent by default, visible on hover */
.scrollbar-auto-hide::-webkit-scrollbar-thumb {
  background: transparent !important;
}

.scrollbar-auto-hide:hover::-webkit-scrollbar-thumb {
  background: var(--color-neutral-300) !important;
}

.scrollbar-auto-hide:hover::-webkit-scrollbar-thumb:hover {
  background: var(--color-neutral-500) !important;
}

.dark .scrollbar-auto-hide:hover::-webkit-scrollbar-thumb {
  background: oklch(0.38 0.015 270) !important;
}

.dark .scrollbar-auto-hide:hover::-webkit-scrollbar-thumb:hover {
  background: oklch(0.48 0.015 270) !important;
}

/* Hidden scrollbar (keep scroll behavior) */
.scrollbar-none {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}

/* Radix ScrollArea: match global scrollbar */
[data-slot="scroll-area-scrollbar"][data-orientation="vertical"] {
  width: 6px !important;
  min-width: 6px;
}

[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"] {
  height: 6px !important;
  min-height: 6px;
}

[data-slot="scroll-area-thumb"] {
  background: var(--color-neutral-300);
  border-radius: var(--radius-full);
  transition: background var(--duration-fast) ease;
}

[data-slot="scroll-area-thumb"]:hover {
  background: var(--color-neutral-500);
}

.dark [data-slot="scroll-area-thumb"] {
  background: oklch(0.38 0.015 270);
}

.dark [data-slot="scroll-area-thumb"]:hover {
  background: oklch(0.48 0.015 270);
}

/* ===== Reduced Motion ===== */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 100ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 100ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/design-system/src/base.css
git commit -m "feat(design-system): add base.css with reset, Inter font, focus, scrollbar"
```

---

### Task 3: Write animations.css (shared keyframes + utilities)

**Files:**
- Create: `packages/design-system/src/animations.css`

- [ ] **Step 1: Write animations.css**

```css
/**
 * Paperclip Shared Animations
 * Keyframes and utility classes for page transitions, list stagger, and feedback.
 */

/* ===== Keyframes ===== */

/* Page enter: fade + slide up */
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* List item stagger: fade + slide up (smaller) */
@keyframes stagger-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Success checkmark bounce */
@keyframes success-bounce {
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Item delete: fade + collapse */
@keyframes item-remove {
  0%   { opacity: 1; max-height: 200px; }
  40%  { opacity: 0; }
  100% { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; overflow: hidden; }
}

/* New item highlight flash */
@keyframes item-highlight {
  0%   { background-color: color-mix(in oklab, var(--primary) 15%, transparent); }
  100% { background-color: transparent; }
}

/* Skeleton shimmer */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Spinner rotation */
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Toast slide in from right */
@keyframes toast-slide-in {
  from { transform: translateX(calc(100% + 1rem)); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

/* Toast slide out to right */
@keyframes toast-slide-out {
  from { transform: translateX(0); opacity: 1; }
  to   { transform: translateX(calc(100% + 1rem)); opacity: 0; }
}

/* Dialog enter */
@keyframes dialog-enter {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}

/* Dialog exit */
@keyframes dialog-exit {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.97); }
}

/* Sheet slide in from right */
@keyframes sheet-slide-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* Sheet slide in from bottom */
@keyframes sheet-slide-in-bottom {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* Backdrop fade */
@keyframes backdrop-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Popover scale + fade */
@keyframes popover-enter {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

/* Counting number animation helper — JS sets --count-from and --count-to */
@keyframes count-up {
  from { --display-count: var(--count-from); }
  to   { --display-count: var(--count-to); }
}

/* Dashboard activity row entry (preserved from existing) */
@keyframes dashboard-activity-enter {
  0%   { opacity: 0; transform: translateY(-14px) scale(0.985); filter: blur(4px); }
  62%  { opacity: 1; transform: translateY(2px) scale(1.002); filter: blur(0); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes dashboard-activity-highlight {
  0%   { box-shadow: inset 2px 0 0 var(--primary); background-color: color-mix(in oklab, var(--accent) 55%, transparent); }
  100% { box-shadow: inset 0 0 0 transparent; background-color: transparent; }
}

/* ===== Animation Utility Classes ===== */

.animate-page-enter {
  animation: page-enter var(--duration-normal) var(--ease-out) both;
}

.animate-stagger-enter {
  animation: stagger-enter var(--duration-normal) var(--ease-out) both;
}

/* Apply stagger delay via CSS custom property: style="--stagger-index: 0" */
.animate-stagger-enter {
  animation-delay: calc(var(--stagger-index, 0) * 30ms);
}

.animate-success-bounce {
  animation: success-bounce 300ms var(--ease-spring) both;
}

.animate-item-remove {
  animation: item-remove 300ms var(--ease-in) both;
}

.animate-item-highlight {
  animation: item-highlight 500ms var(--ease-default) both;
}

/* Existing activity row class — kept for backwards compat */
.activity-row-enter {
  animation:
    dashboard-activity-enter 520ms cubic-bezier(0.16, 1, 0.3, 1),
    dashboard-activity-highlight 920ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* ===== Reduced Motion: cancel animations ===== */
@media (prefers-reduced-motion: reduce) {
  .animate-page-enter,
  .animate-stagger-enter,
  .animate-success-bounce,
  .animate-item-remove,
  .animate-item-highlight,
  .activity-row-enter {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/design-system/src/animations.css
git commit -m "feat(design-system): add animations.css with shared keyframes and utilities"
```

---

### Task 4: Write component CSS files (button, input, card, dialog, sheet, toast, skeleton, spinner, badge, popover, tabs, tooltip, inline-alert, empty-state)

**Files:**
- Create: `packages/design-system/src/components/button.css`
- Create: `packages/design-system/src/components/input.css`
- Create: `packages/design-system/src/components/card.css`
- Create: `packages/design-system/src/components/dialog.css`
- Create: `packages/design-system/src/components/sheet.css`
- Create: `packages/design-system/src/components/toast.css`
- Create: `packages/design-system/src/components/skeleton.css`
- Create: `packages/design-system/src/components/spinner.css`
- Create: `packages/design-system/src/components/badge.css`
- Create: `packages/design-system/src/components/popover.css`
- Create: `packages/design-system/src/components/tabs.css`
- Create: `packages/design-system/src/components/tooltip.css`
- Create: `packages/design-system/src/components/inline-alert.css`
- Create: `packages/design-system/src/components/empty-state.css`

This is a large task. Each file is a self-contained component stylesheet using `data-slot` selectors and design tokens. Create all files, then commit once.

- [ ] **Step 1: Create button.css**

```css
/* Button — [data-slot="button"] */

[data-slot="button"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  white-space: nowrap;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: var(--leading-normal);
  cursor: pointer;
  user-select: none;
  transition:
    color var(--duration-fast) var(--ease-default),
    background-color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default),
    opacity var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
  outline: none;
  pointer-events: auto;
  position: relative;
}

[data-slot="button"]:disabled {
  pointer-events: none;
  opacity: 0.5;
  cursor: not-allowed;
}

[data-slot="button"] svg {
  pointer-events: none;
  flex-shrink: 0;
}

/* Active press feedback */
[data-slot="button"]:active:not(:disabled) {
  transform: scale(0.98);
}

/* Focus ring */
[data-slot="button"]:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

[data-slot="button"][aria-invalid="true"] {
  outline: 2px solid var(--destructive);
  outline-offset: 2px;
}

/* --- Variants --- */

[data-slot="button"][data-variant="default"] {
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  box-shadow: var(--shadow-xs);
}

[data-slot="button"][data-variant="default"]:hover:not(:disabled) {
  background: var(--color-primary-600);
  box-shadow: var(--shadow-sm);
}

[data-slot="button"][data-variant="destructive"] {
  background: var(--destructive);
  color: white;
  border: none;
  box-shadow: var(--shadow-xs);
}

[data-slot="button"][data-variant="destructive"]:hover:not(:disabled) {
  background: oklch(0.45 0.18 25);
  box-shadow: var(--shadow-sm);
}

.dark [data-slot="button"][data-variant="destructive"] {
  background: color-mix(in oklab, var(--destructive) 80%, transparent);
}

[data-slot="button"][data-variant="outline"] {
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--foreground);
  box-shadow: var(--shadow-xs);
}

[data-slot="button"][data-variant="outline"]:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--color-neutral-300);
}

.dark [data-slot="button"][data-variant="outline"] {
  background: color-mix(in oklab, var(--input) 30%, transparent);
  border-color: var(--input);
}

.dark [data-slot="button"][data-variant="outline"]:hover:not(:disabled) {
  background: color-mix(in oklab, var(--input) 50%, transparent);
}

[data-slot="button"][data-variant="secondary"] {
  background: var(--secondary);
  color: var(--secondary-foreground);
  border: none;
}

[data-slot="button"][data-variant="secondary"]:hover:not(:disabled) {
  background: var(--color-neutral-200);
}

[data-slot="button"][data-variant="ghost"] {
  background: transparent;
  border: none;
  color: inherit;
}

[data-slot="button"][data-variant="ghost"]:hover:not(:disabled) {
  background: color-mix(in oklab, var(--accent) 60%, transparent);
  color: var(--accent-foreground);
}

[data-slot="button"][data-variant="link"] {
  background: transparent;
  border: none;
  color: var(--primary);
  text-underline-offset: 4px;
}

[data-slot="button"][data-variant="link"]:hover:not(:disabled) {
  text-decoration: underline;
}

/* --- Sizes --- */

[data-slot="button"][data-size="default"] {
  height: 2.5rem;
  padding: var(--space-2) var(--space-4);
}
[data-slot="button"][data-size="default"]:has(> svg) { padding-left: var(--space-3); }
[data-slot="button"][data-size="default"] svg { width: 1rem; height: 1rem; }

[data-slot="button"][data-size="xs"] {
  height: 1.5rem;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  border-radius: var(--radius-sm);
}
[data-slot="button"][data-size="xs"]:has(> svg) { padding-left: 0.375rem; }
[data-slot="button"][data-size="xs"] svg { width: 0.75rem; height: 0.75rem; }

[data-slot="button"][data-size="sm"] {
  height: 2.25rem;
  gap: 0.375rem;
  padding: 0 var(--space-3);
  border-radius: var(--radius-md);
}
[data-slot="button"][data-size="sm"]:has(> svg) { padding-left: 0.625rem; }
[data-slot="button"][data-size="sm"] svg { width: 1rem; height: 1rem; }

[data-slot="button"][data-size="lg"] {
  height: 2.75rem;
  padding: 0 var(--space-6);
  font-size: var(--text-base);
  border-radius: var(--radius-md);
}
[data-slot="button"][data-size="lg"]:has(> svg) { padding-left: var(--space-4); }
[data-slot="button"][data-size="lg"] svg { width: 1.25rem; height: 1.25rem; }

/* Icon-only buttons */
[data-slot="button"][data-size="icon"]    { width: 2.5rem;  height: 2.5rem;  padding: 0; }
[data-slot="button"][data-size="icon-xs"] { width: 1.5rem;  height: 1.5rem;  padding: 0; border-radius: var(--radius-sm); }
[data-slot="button"][data-size="icon-sm"] { width: 2.25rem; height: 2.25rem; padding: 0; }
[data-slot="button"][data-size="icon-lg"] { width: 2.75rem; height: 2.75rem; padding: 0; }

[data-slot="button"][data-size="icon"] svg,
[data-slot="button"][data-size="icon-sm"] svg,
[data-slot="button"][data-size="icon-lg"] svg { width: 1rem; height: 1rem; }
[data-slot="button"][data-size="icon-xs"] svg { width: 0.75rem; height: 0.75rem; }

/* --- Loading state --- */
[data-slot="button"][data-loading="true"] {
  color: transparent !important;
  pointer-events: none;
}

[data-slot="button"][data-loading="true"]::after {
  content: "";
  position: absolute;
  width: 1rem;
  height: 1rem;
  border: 2px solid currentColor;
  border-color: var(--primary-foreground) transparent var(--primary-foreground) transparent;
  border-radius: var(--radius-full);
  animation: spin 600ms linear infinite;
}

[data-slot="button"][data-variant="outline"][data-loading="true"]::after,
[data-slot="button"][data-variant="ghost"][data-loading="true"]::after,
[data-slot="button"][data-variant="secondary"][data-loading="true"]::after {
  border-color: var(--foreground) transparent var(--foreground) transparent;
}
```

- [ ] **Step 2: Create input.css**

```css
/* Input, Textarea, Select — form controls */

[data-slot="input"],
[data-slot="textarea"] {
  display: flex;
  width: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--input);
  background: var(--card);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--foreground);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
  outline: none;
}

[data-slot="input"] {
  height: 2.5rem;
}

[data-slot="input"]::placeholder,
[data-slot="textarea"]::placeholder {
  color: var(--muted-foreground);
}

[data-slot="input"]:hover:not(:disabled),
[data-slot="textarea"]:hover:not(:disabled) {
  border-color: var(--color-neutral-300);
}

[data-slot="input"]:focus,
[data-slot="textarea"]:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent);
}

[data-slot="input"]:disabled,
[data-slot="textarea"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--muted);
}

[data-slot="input"][aria-invalid="true"],
[data-slot="textarea"][aria-invalid="true"] {
  border-color: var(--destructive);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--destructive) 15%, transparent);
}

/* Select trigger */
[data-slot="select-trigger"] {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  white-space: nowrap;
  border-radius: var(--radius-md);
  border: 1px solid var(--input);
  background: var(--card);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--foreground);
  height: 2.5rem;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default);
  outline: none;
}

[data-slot="select-trigger"]:hover:not(:disabled) {
  border-color: var(--color-neutral-300);
}

[data-slot="select-trigger"]:focus-visible,
[data-slot="select-trigger"][data-state="open"] {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent);
}

[data-slot="select-trigger"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Select content (dropdown) */
[data-slot="select-content"] {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-1);
  animation: popover-enter var(--duration-fast) var(--ease-out);
  overflow: hidden;
}

[data-slot="select-item"] {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default);
  outline: none;
}

[data-slot="select-item"]:hover,
[data-slot="select-item"][data-highlighted] {
  background: var(--accent);
}

/* Label */
[data-slot="label"] {
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: var(--leading-normal);
  color: var(--foreground);
}

[data-slot="label"][data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Create card.css**

```css
/* Card — hover lift animation */

[data-slot="card"] {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: var(--shadow-sm);
  transition:
    transform var(--duration-normal) var(--ease-default),
    box-shadow var(--duration-normal) var(--ease-default);
}

/* Clickable cards get hover lift */
a[data-slot="card"]:hover,
button[data-slot="card"]:hover,
[data-slot="card"][data-clickable]:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

a[data-slot="card"]:active,
button[data-slot="card"]:active,
[data-slot="card"][data-clickable]:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

[data-slot="card-header"] {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-4) 0;
}

[data-slot="card-title"] {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-tight);
}

[data-slot="card-description"] {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

[data-slot="card-content"] {
  padding: var(--space-4);
}

[data-slot="card-footer"] {
  display: flex;
  align-items: center;
  padding: 0 var(--space-4) var(--space-4);
}
```

- [ ] **Step 4: Create skeleton.css**

```css
/* Skeleton — shimmer loading placeholder */

[data-slot="skeleton"] {
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    var(--muted) 0%,
    color-mix(in oklab, var(--muted) 60%, var(--card)) 40%,
    var(--muted) 80%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  [data-slot="skeleton"] {
    animation: none;
    background: var(--muted);
  }
}
```

- [ ] **Step 5: Create spinner.css**

```css
/* Spinner — brand-color rotating arc */

[data-slot="spinner"] {
  display: inline-block;
  border: 2px solid color-mix(in oklab, var(--primary) 25%, transparent);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 600ms linear infinite;
}

[data-slot="spinner"][data-size="sm"] { width: 1rem;   height: 1rem;   border-width: 2px; }
[data-slot="spinner"][data-size="md"] { width: 1.5rem; height: 1.5rem; border-width: 2px; }
[data-slot="spinner"][data-size="lg"] { width: 2rem;   height: 2rem;   border-width: 3px; }
[data-slot="spinner"][data-size="xl"] { width: 3rem;   height: 3rem;   border-width: 3px; }

@media (prefers-reduced-motion: reduce) {
  [data-slot="spinner"] {
    animation-duration: 1.5s;
  }
}
```

- [ ] **Step 6: Create dialog.css**

```css
/* Dialog — backdrop blur + scale enter */

[data-slot="dialog-overlay"] {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  background: oklch(0 0 0 / 0.5);
  backdrop-filter: blur(4px);
  animation: backdrop-fade-in var(--duration-normal) var(--ease-out);
}

[data-slot="dialog-content"] {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: var(--z-dialog);
  transform: translate(-50%, -50%);
  max-width: min(32rem, 100vw - 3rem);
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
  animation: dialog-enter var(--duration-normal) var(--ease-out);
  transition: max-width var(--duration-normal) var(--ease-out);
}

[data-slot="dialog-content"][data-state="closed"] {
  animation: dialog-exit var(--duration-fast) var(--ease-in);
}

[data-slot="dialog-header"] {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
}

[data-slot="dialog-title"] {
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-tight);
}

[data-slot="dialog-description"] {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

[data-slot="dialog-footer"] {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
```

- [ ] **Step 7: Create sheet.css**

```css
/* Sheet (Drawer) — slide in from right or bottom */

[data-slot="sheet-overlay"] {
  position: fixed;
  inset: 0;
  z-index: var(--z-dialog);
  background: oklch(0 0 0 / 0.5);
  backdrop-filter: blur(4px);
  animation: backdrop-fade-in var(--duration-normal) var(--ease-out);
}

[data-slot="sheet-content"] {
  position: fixed;
  z-index: var(--z-dialog);
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
}

[data-slot="sheet-content"][data-side="right"] {
  inset: 0 0 0 auto;
  width: min(24rem, 100vw - 2rem);
  border-left: 1px solid var(--border);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  animation: sheet-slide-in-right var(--duration-slow) var(--ease-out);
}

[data-slot="sheet-content"][data-side="bottom"] {
  inset: auto 0 0 0;
  max-height: 85vh;
  border-top: 1px solid var(--border);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  animation: sheet-slide-in-bottom var(--duration-slow) var(--ease-out);
}

[data-slot="sheet-header"] {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border);
}

[data-slot="sheet-title"] {
  font-size: var(--text-lg);
  font-weight: 600;
}

[data-slot="sheet-description"] {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  margin-top: var(--space-1);
}

[data-slot="sheet-footer"] {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
```

- [ ] **Step 8: Create toast.css**

```css
/* Toast — slide in from right, stacking */

[data-slot="toast-viewport"] {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
  max-width: 420px;
  width: 100%;
  pointer-events: none;
}

[data-slot="toast"] {
  pointer-events: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: var(--shadow-lg);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  animation: toast-slide-in var(--duration-normal) var(--ease-out);
}

[data-slot="toast"][data-state="closed"] {
  animation: toast-slide-out var(--duration-normal) var(--ease-in) forwards;
}

[data-slot="toast"][data-variant="success"] {
  border-color: var(--color-success-border);
  background: var(--color-success-bg);
}

[data-slot="toast"][data-variant="error"] {
  border-color: var(--color-error-border);
  background: var(--color-error-bg);
}

[data-slot="toast"][data-variant="warning"] {
  border-color: var(--color-warning-border);
  background: var(--color-warning-bg);
}

[data-slot="toast"][data-variant="info"] {
  border-color: var(--color-info-border);
  background: var(--color-info-bg);
}

[data-slot="toast-title"] {
  font-size: var(--text-sm);
  font-weight: 600;
}

[data-slot="toast-description"] {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

[data-slot="toast-close"] {
  flex-shrink: 0;
  margin-left: auto;
}
```

- [ ] **Step 9: Create badge.css**

```css
/* Badge — semantic variants */

[data-slot="badge"] {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border-radius: var(--radius-full);
  padding: 0.125rem var(--space-2);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: var(--leading-normal);
  white-space: nowrap;
  transition: background var(--duration-fast) var(--ease-default);
}

[data-slot="badge"][data-variant="default"] {
  background: var(--primary);
  color: var(--primary-foreground);
}

[data-slot="badge"][data-variant="secondary"] {
  background: var(--secondary);
  color: var(--secondary-foreground);
}

[data-slot="badge"][data-variant="outline"] {
  border: 1px solid var(--border);
  color: var(--foreground);
  background: transparent;
}

[data-slot="badge"][data-variant="destructive"] {
  background: var(--color-error-bg);
  color: var(--color-error-text);
  border: 1px solid var(--color-error-border);
}

[data-slot="badge"][data-variant="success"] {
  background: var(--color-success-bg);
  color: var(--color-success-text);
  border: 1px solid var(--color-success-border);
}

[data-slot="badge"][data-variant="warning"] {
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
  border: 1px solid var(--color-warning-border);
}

[data-slot="badge"][data-variant="info"] {
  background: var(--color-info-bg);
  color: var(--color-info-text);
  border: 1px solid var(--color-info-border);
}
```

- [ ] **Step 10: Create popover.css**

```css
/* Popover — scale + fade enter */

[data-slot="popover-content"] {
  z-index: var(--z-dialog);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-lg);
  padding: var(--space-4);
  animation: popover-enter var(--duration-fast) var(--ease-out);
  outline: none;
}
```

- [ ] **Step 11: Create tabs.css**

```css
/* Tabs — underline slide animation */

[data-slot="tabs-list"] {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid var(--border);
}

[data-slot="tabs-trigger"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--muted-foreground);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-normal) var(--ease-default);
  outline: none;
  margin-bottom: -1px;
}

[data-slot="tabs-trigger"]:hover {
  color: var(--foreground);
}

[data-slot="tabs-trigger"][data-state="active"] {
  color: var(--foreground);
  border-bottom-color: var(--primary);
}

[data-slot="tabs-trigger"]:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

[data-slot="tabs-content"] {
  padding-top: var(--space-4);
  animation: page-enter var(--duration-normal) var(--ease-out);
}
```

- [ ] **Step 12: Create tooltip.css**

```css
/* Tooltip */

[data-slot="tooltip-content"] {
  z-index: calc(var(--z-dialog) + 10);
  border-radius: var(--radius-sm);
  background: var(--color-neutral-900);
  color: white;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  line-height: var(--leading-normal);
  box-shadow: var(--shadow-md);
  animation: popover-enter 100ms var(--ease-out);
  pointer-events: none;
  max-width: 20rem;
}

.dark [data-slot="tooltip-content"] {
  background: var(--color-neutral-100);
  color: var(--color-neutral-900);
}
```

- [ ] **Step 13: Create inline-alert.css**

```css
/* InlineAlert — 4 semantic variants */

[data-slot="inline-alert"] {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

[data-slot="inline-alert"] svg {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
}

[data-slot="inline-alert"][data-variant="success"] {
  background: var(--color-success-bg);
  border-color: var(--color-success-border);
  color: var(--color-success-text);
}

[data-slot="inline-alert"][data-variant="warning"] {
  background: var(--color-warning-bg);
  border-color: var(--color-warning-border);
  color: var(--color-warning-text);
}

[data-slot="inline-alert"][data-variant="error"] {
  background: var(--color-error-bg);
  border-color: var(--color-error-border);
  color: var(--color-error-text);
}

[data-slot="inline-alert"][data-variant="info"] {
  background: var(--color-info-bg);
  border-color: var(--color-info-border);
  color: var(--color-info-text);
}

[data-slot="inline-alert-title"] {
  font-weight: 600;
  margin-bottom: var(--space-1);
}
```

- [ ] **Step 14: Create empty-state.css**

```css
/* EmptyState — rich guided empty state */

[data-slot="empty-state"] {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-12) var(--space-6);
  max-width: 28rem;
  margin: 0 auto;
}

[data-slot="empty-state-icon"] {
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
  background: var(--color-primary-50);
  color: var(--color-primary-400);
  margin-bottom: var(--space-4);
}

.dark [data-slot="empty-state-icon"] {
  background: color-mix(in oklab, var(--color-primary-500) 15%, transparent);
  color: var(--color-primary-300);
}

[data-slot="empty-state-icon"] svg {
  width: 2rem;
  height: 2rem;
}

[data-slot="empty-state-title"] {
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-tight);
  color: var(--foreground);
  margin-bottom: var(--space-2);
}

[data-slot="empty-state-description"] {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  line-height: var(--leading-relaxed);
  margin-bottom: var(--space-6);
}

[data-slot="empty-state-actions"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: center;
}

[data-slot="empty-state-footer"] {
  margin-top: var(--space-4);
  font-size: var(--text-xs);
  color: var(--muted-foreground);
}

[data-slot="empty-state-footer"] a {
  color: var(--primary);
  text-decoration: none;
}

[data-slot="empty-state-footer"] a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 15: Commit all component CSS**

```bash
git add packages/design-system/src/components/
git commit -m "feat(design-system): add all core component CSS files

Button, Input, Card, Dialog, Sheet, Toast, Skeleton, Spinner,
Badge, Popover, Tabs, Tooltip, InlineAlert, EmptyState.
All using design tokens and data-slot selectors."
```

---

### Task 5: Write index.css entry point for design-system package

**Files:**
- Create: `packages/design-system/src/index.css`

- [ ] **Step 1: Write index.css**

```css
/**
 * @paperclipai/ui — Design System Entry Point
 * Import order matters: tokens → base → animations → components.
 */

/* Layer 0: Design Tokens */
@import "./tokens.css";

/* Layer 1: Base Reset & Font */
@import "./base.css";

/* Shared Animations & Keyframes */
@import "./animations.css";

/* Layer 3: UI Components */
@import "./components/button.css";
@import "./components/input.css";
@import "./components/card.css";
@import "./components/badge.css";
@import "./components/skeleton.css";
@import "./components/spinner.css";
@import "./components/dialog.css";
@import "./components/sheet.css";
@import "./components/toast.css";
@import "./components/popover.css";
@import "./components/tabs.css";
@import "./components/tooltip.css";
@import "./components/inline-alert.css";
@import "./components/empty-state.css";
```

- [ ] **Step 2: Commit**

```bash
git add packages/design-system/src/index.css
git commit -m "feat(design-system): add index.css entry point"
```

---

### Task 6: Wire up design-system to the app

**Files:**
- Modify: `paperclip-official/ui/package.json` (add dependency)
- Modify: `paperclip-official/ui/src/index.css` (replace inline tokens with import)
- Modify: `paperclip-official/ui/src/styles/ui.css` (remove component styles now in design-system)

- [ ] **Step 1: Add @paperclipai/ui dependency to ui/package.json**

Add `"@paperclipai/ui": "workspace:*"` to the `dependencies` object in `paperclip-official/ui/package.json`.

- [ ] **Step 2: Run pnpm install to link workspace package**

Run: `cd paperclip-official && pnpm install`
Expected: pnpm links the workspace package

- [ ] **Step 3: Refactor ui/src/index.css**

Replace the entire `:root { ... }` and `.dark { ... }` token blocks, and all scrollbar/base styles that are now in `base.css`, with a single import. Keep the app-specific styles (MDXEditor, app-gate, activity-row, prose, etc.) that are NOT component-level.

The new `index.css` should look like:

```css
/* Import design system (tokens + base + components) */
@import "@paperclipai/ui";

/* App-level utilities */
@import "./styles/utilities.css";

/* App-level page styles */
@import "./styles/board-pages.css";

/* ===== App-Specific Styles Below ===== */
/* These are NOT part of the reusable design system */

/* Dialog layout override for app-specific max-width transition */
[data-slot="dialog-content"] {
  transition: max-width var(--duration-normal) var(--ease-out);
}

/* MDXEditor theme integration */
.paperclip-mdxeditor-scope {
  position: relative;
}
/* ... (keep all .paperclip-mdxeditor-* styles as-is) ... */
/* ... (keep all .paperclip-markdown styles as-is) ... */
/* ... (keep all .paperclip-mermaid styles as-is) ... */
/* ... (keep all .app-gate-* styles as-is) ... */
/* ... (keep all .app-not-found-* styles as-is) ... */
/* ... (keep all MDXEditor z-index overrides as-is) ... */
```

Key changes:
- Remove the `:root { --radius: 0; ... }` block (now in tokens.css)
- Remove the `.dark { ... }` block (now in tokens.css)
- Remove all `* { border-color }`, `html`, `body` styles (now in base.css)
- Remove all scrollbar styles (now in base.css)
- Remove `[data-toast-viewport]` (now in base.css)
- Remove touch-action styles (now in base.css)
- Remove `@media (pointer: coarse)` (now in base.css)
- Remove `h1,h2,h3 { text-wrap: balance }` (now in base.css)
- Remove `.dark { color-scheme: dark }` (now in tokens.css)
- Remove `@keyframes dashboard-activity-enter` and `dashboard-activity-highlight` (now in animations.css)
- Remove `.activity-row-enter` (now in animations.css)
- Remove `@media (prefers-reduced-motion)` for activity-row (now in animations.css)
- Keep everything else (MDXEditor, markdown, mermaid, app-gate, not-found)

- [ ] **Step 4: Remove migrated component styles from ui.css**

From `ui/src/styles/ui.css`, remove the `[data-slot="button"]` block and all its variants/sizes (these are now in `packages/design-system/src/components/button.css`). Also remove any `[data-slot="skeleton"]`, badge, tooltip, popover, avatar styles that have been migrated.

Keep styles that are NOT yet migrated (breadcrumb, identity, avatar — if they have app-specific logic).

- [ ] **Step 5: Verify the build**

Run: `cd paperclip-official && pnpm --filter ui build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Start dev server and verify visually**

Run: `cd paperclip-official && pnpm --filter ui dev`
Expected: App loads with new brand colors, rounded corners, Inter font

- [ ] **Step 7: Commit**

```bash
git add ui/package.json ui/src/index.css ui/src/styles/ui.css
git commit -m "feat: wire up @paperclipai/ui design system to app

Replace inline token definitions with design-system package import.
Brand color changes from pure gray to blue-purple (hue 270).
Border radius changes from 0 to 8px globally.
Inter variable font loaded. Component styles migrated."
```

---

### Task 7: Visual verification and fix pass

**Files:**
- Possibly modify: any CSS file where visual issues are found

- [ ] **Step 1: Check all major pages in light mode**

Open the app in browser and navigate through:
- Dashboard
- Issues list
- Agent detail
- Chat
- Settings

Look for: broken layouts, invisible text, missing borders, misaligned elements, components that lost their styles.

- [ ] **Step 2: Check dark mode**

Toggle to dark mode and re-check the same pages. Look for: text contrast issues, borders invisible, backgrounds not changing.

- [ ] **Step 3: Check responsive (resize browser)**

Resize to tablet (768px) and mobile (375px). Verify sidebar collapse and mobile nav.

- [ ] **Step 4: Fix any issues found**

Apply targeted CSS fixes. Each fix should be in the design-system package if it's a token/component issue, or in the app CSS if it's app-specific.

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix(design-system): visual verification fixes after Phase 1 migration"
```
