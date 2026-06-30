# EMRID Operations — Design Language

> The permanent visual & interaction reference. **Frozen** at Sprint 4. This is the *foundations* layer (tokens, type, spacing, colour, motion, states, a11y); the component catalogue and framework usage live in [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md), and the domain architecture in [`PRODUCT_ARCHITECTURE.md`](./PRODUCT_ARCHITECTURE.md).

## Voice
Professional, minimal, calm, confident. Whitespace over clutter; weight and colour carry hierarchy more than size. Subtle motion, no visual noise. The Operations theme is deliberately distinct from the Patient Platform (teal-blue + emergency red): an **indigo/violet accent on a neutral zinc surface scale**.

## Tokens (single source of truth)
All colour is a CSS custom property (HSL channels) in `app/globals.css`, exposed to Tailwind as `hsl(var(--token) / <alpha-value>)` in `tailwind.config.ts`. **Components reference semantic tokens only — never raw hex.** This is what makes dark mode a single class flip and keeps opacity utilities (`bg-primary/10`) working.

| Token | Role | Light | Dark |
|---|---|---|---|
| `background` / `foreground` | App canvas / primary text | `240 20% 99%` / `240 10% 6%` | `240 10% 5%` / `240 6% 96%` |
| `card` / `card-foreground` | Raised surfaces | `0 0% 100%` | `240 8% 8%` |
| `popover` | Overlays (palette, menus, toasts) | `0 0% 100%` | `240 8% 9%` |
| `muted` / `muted-foreground` | Subtle surface / secondary text | `240 5% 96%` / `240 4% 44%` | `240 5% 14%` / `240 5% 62%` |
| `primary` / `primary-muted` | Indigo accent / its tint | `243 75% 59%` | `243 80% 68%` |
| `border` / `input` / `ring` | Lines / fields / focus ring | `240 6% 90%` | `240 5% 17%` |
| `success` / `warning` / `danger` / `info` | Semantic (status, priority, alerts) | green / amber / red / blue | brightened |

## Colour system
- **Accent (`primary`, indigo):** primary actions, active nav, links, focus ring, in-progress.
- **Neutrals (zinc):** surfaces and text — the calm canvas everything sits on.
- **Semantic:** `success` (protected / done / ready), `warning` (in progress / nearly ready / waiting), `danger` (unprotected / blocked / urgent / not ready), `info` (informational). Always paired with a label or dot — **colour is never the only signal**.
- Tints via opacity (`bg-success/10 text-success`) for chips and soft fills.

## Typography
System font stack via `--font-sans` (fast, no webfont). Use the `Typography` helpers — don't hand-roll sizes:
- **PageTitle** — 24px / semibold / tight tracking — one per page.
- **SectionTitle** — 16px / semibold — section + card headings.
- **Eyebrow** — 12px / uppercase / 0.14em tracking / muted — label above a title.
- **Lead** — 15px / muted — supporting line under a title.
- **Text** — 14px — default body. **Muted** — 14px / muted — secondary body.
- Numerals that change use `tabular-nums` (metrics, the Protected Lives figure).

## Spacing & layout
Tailwind's 4px scale. Conventions: page sections `space-y-6`; cards `p-5`; grids `gap-6` (major) / `gap-4` (minor); content max-width `max-w-7xl` centered; workspace is a 3-col grid (`lg:grid-cols-3`, main spans 2). Sidebar fixed 240px (`md+`); no mobile layout by design (desktop/tablet).

## Elevation
Flat and quiet. `shadow-sm` on cards; `shadow-lg` on popovers/toasts/menus; `backdrop-blur` on the sticky header and the command-palette overlay. Borders (`border-border`) do most of the separation work; shadows signal "floating," not decoration.

## Radius
`--radius: 0.75rem`. `rounded-lg` (cards/dialogs), `rounded-md` (buttons/inputs/rows), `rounded-full` (badges/avatars/progress).

## Motion
Purposeful and short; all disabled under `prefers-reduced-motion`.
- `fade-in` 0.15s — content/route entrance.
- `scale-in` 0.15s — popovers, the command palette, menus.
- `slide-up` 0.2s — toasts.
- `shimmer` 1.5s — skeleton loaders.
- Buttons: `active:scale-[0.98]` for tactile press; hover is a colour transition only.

## Icons
[lucide-react](https://lucide.dev), default stroke. Standard size `h-4 w-4` (16px); `h-3.5` inline-with-text; `h-5`+ only for feature glyphs. Always `aria-hidden` when decorative; icon-only controls use `IconButton` with a required label.

## States (every surface ships all of them)
- **Empty:** `EmptyState` (icon + title + description + optional action). Positive when it means "done" (e.g. "No active work — ready for protection").
- **Loading:** `Skeleton`/`SkeletonText` mirroring the real layout; route-level `loading.tsx` for the shell, Customers index, and Workspace.
- **Error:** the shell `error.tsx` boundary — calm, recoverable, with a retry; never a raw crash.
- **Not found:** contextual (e.g. unknown customer → "Customer not found" + back to Customers).
- **Interaction feedback:** inert/mock actions confirm via toast (`ToastProvider`) — never silent.

## Accessibility
Semantic landmarks (`nav[aria-label]`, `main#main-content`, `aside`); a skip-to-content link; `aria-current` on active nav; visible `focus-visible` rings everywhere; full ARIA keyboard patterns for tabs (roving focus) and the command palette (combobox→listbox, ↑/↓/Enter/Esc); `role="progressbar"` with values; toasts in an `aria-live` region; colour never the sole signal. Target: fully keyboard-operable, WCAG-AA contrast in both themes.

## Dark mode
A single `.dark` class on `<html>`, toggled by `ThemeProvider` (light / dark / system, persisted; no-flash `<head>` script applies it before paint). Because components use only semantic tokens, the entire product re-themes from the token block — verify new UI in both themes.

## Interaction principles
- The primary action is the most prominent and, where possible, contextual (the biggest lever).
- One primary action per surface; secondary/destructive actions are visually quieter.
- Rows and cards are whole click targets where they lead somewhere (queue row → workspace).
- Keyboard parity: anything clickable is reachable and operable by keyboard.
- Feedback is immediate and honest (optimistic/ephemeral now; server-backed later, same affordance).

## Using the language
Build new UI from the tokens and `Typography`/primitive components — never raw colours or ad-hoc sizes. If a new need can't be expressed in these tokens, that's a design-language decision (update this doc), not a one-off override.
