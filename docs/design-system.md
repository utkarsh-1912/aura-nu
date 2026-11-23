# Aura design system

Direction: modern productivity (Linear / Notion-like). Calm, dense, keyboard-first. One accent. No decorative gradients or glass.
Live reference: run the app and open `/design`. Source: `src/ui/*`, tokens in `src/index.css`.

## Principles
1. **Content first.** Chrome recedes: hairline borders, neutral surfaces, accent only for the primary action and selection.
2. **Tokens, never raw colors.** No `slate-*`, `zinc-*`, `blue-*`, hex, or `dark:` color pairs. Tokens switch with the `.dark` class automatically.
3. **Density with air.** App chrome is 13px; editor body 15px. 8px grid; row height 32px (28px compact); touch targets >= 40px on phones.
4. **Accessible by default.** Every icon-only control has a label (`IconButton label=`), visible `focus-visible` outlines, 4.5:1 text contrast, full keyboard paths, `prefers-reduced-motion` respected.
5. **Responsive.** Design at 375, 768 and 1280. Three panes on desktop, two on tablet, one stack with bottom navigation on phones.

## Tokens (Tailwind utilities)
| Purpose | Utilities |
|---|---|
| App background / sidebar / panel / popover | `bg-surface` `bg-sidebar` `bg-panel` `bg-raised` |
| Interactive states | `hover:bg-hover` `bg-active` (pressed/selected neutral) |
| Borders | `border-line` (default) `border-line-strong` (hover, inputs) |
| Text | `text-fg` `text-fg-muted` `text-fg-subtle` |
| Accent | `bg-accent text-accent-fg` `hover:bg-accent-hover` `bg-accent-soft text-accent` (selected rows, tags) |
| Status | `text-success bg-success-soft`, `warning`, `danger` likewise |
| Elevation | `shadow-soft` (controls) `shadow-pop` (menus, dialogs) |

Type scale: `text-[11px]` meta, `[12px]` labels, `[13px]` UI, `[14px]` emphasis, `[16px]` section titles, `[20px]` page titles, `[26px]` note title / hero. Weights 400/500/600 only. Font: Inter; mono: JetBrains Mono (`font-mono`).
Radius: controls 6-8px (`rounded-md`), panels/cards 12px (`rounded-lg`), pills `rounded-full`.
Motion: 120-180ms ease-out for hover/open; no bouncing; wrap larger animations in `motion-safe:`.

## Components (`import { ... } from "../ui"`)
`Button` (primary | secondary | subtle | ghost | danger; sm/md/lg; loading), `IconButton` (needs `label`), `Input`, `Textarea`, `Select`, `Field` (label + hint/error wiring), `Switch`, `Checkbox`, `Dialog` (focus trap, Esc, bottom sheet on phones), `Menu` (keyboard nav), `Tooltip`, `Badge`, `Kbd`, `Avatar`, `Separator`, `Panel`, `EmptyState`, `Tabs`, `Segmented`, `Spinner`, `Skeleton`, `ToastViewport`, `Logo`, `LogoMark`, `cn()`.
Use these instead of hand-rolling buttons/inputs/modals. If something is missing, build a small local component in your own file and note it in your handoff so it can be promoted.

## Patterns
- **List row**: 32-56px, title `text-[13px] font-medium`, meta `text-[12px] text-fg-muted`, selected = `bg-accent-soft`, hover = `bg-hover`.
- **Page header**: 48px bar, `border-b border-line`, title left, actions right (ghost/secondary buttons, one primary max).
- **Empty / loading / error**: always design all three (`EmptyState`, `Skeleton`, inline `text-danger` message with retry).
- **Destructive actions**: `danger` variant behind a `Dialog` confirmation that names what is deleted.
- **Brand**: use `<Logo>` / `<LogoMark>`; never the old `/logo.png` image in UI (kept only as a PWA/apple-touch fallback).

## Rules for contributors
- Presentation only unless fixing a bug: keep props, handlers, routes, data flow and storage keys unchanged.
- No new dependencies. No gradients (except `LogoMark`). No glassmorphism/backdrop blur except Dialog scrim.
- Remove `dark:` color overrides when migrating a class to a token.
