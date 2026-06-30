# EMRID Operations — Design System

The permanent component library and design language for EMRID Operations. Every future capability composes these pieces; treat them as the stable foundation.

Live reference: **`/design`** (a QA/documentation route, not in the primary navigation) renders the primitives, the Queue, and the Workspace with mock data.

> For the system's architecture and **architectural law** (one Work Engine, one Queue framework, one Customer Workspace, Work Items as source of truth, queues as projections, Protection above Readiness), see [`PRODUCT_ARCHITECTURE.md`](./PRODUCT_ARCHITECTURE.md). This document covers the *design system*; that one covers the *domain spine*.

## Principles

Simple · fast · consistent · low cognitive load · search-first · workspace-driven · queue-driven. Inspired by Linear, Notion, Raycast, Arc, Superhuman — whitespace over clutter, weight and colour over size, subtle motion, no visual noise. Deliberately distinct from the Patient Platform (which uses a teal-blue brand + emergency red).

## Theme & tokens

The visual foundations — colour tokens, typography, spacing, elevation, radius, motion, dark mode — are documented in **[`DESIGN_LANGUAGE.md`](./DESIGN_LANGUAGE.md)** (the single source). In short: components reference **semantic CSS-variable tokens only** (never raw colours), so dark mode is one `.dark` class flip and opacity utilities (`bg-primary/10`) work. This document focuses on the **components and frameworks** built on those tokens.

## Primitives (`components/ui`)

`Button` (+`ButtonLink`) · `IconButton` (label required) · `Card` (+`CardHeader/Title/Description/Content/Footer`) · `Badge` (tones) · `StatusBadge` · `PriorityBadge` · `MetricCard` (label/value/icon/trend) · `Select` · `Kbd` · `Skeleton`/`SkeletonText` · `LinearProgress`/`CircularProgress` · `EmptyState` · `Typography`. (Text inputs are styled per context — search, combobox, textarea — with shared token classes rather than a single Input primitive.)

Status/priority chips resolve their label + tone from **exhaustive `Record` maps** (`lib/work/status.ts`, `lib/work/priority.ts`) — adding an enum value forces its metadata at compile time.

## Frameworks

### Queue (`components/queue/Queue.tsx`)
One reusable, generic `<Queue<T>>`: filters, multi-sort, cross-page bulk selection, bulk actions, pagination, and status/priority chips. All data work is delegated to the pure, tested `lib/queue/core.ts` (`processQueue` = filter→sort→paginate; selection helpers). Every future queue is a *configuration* of this component. Pair with `<QueueCard>`.

### Workspace (`components/workspace/*`)
The reusable record skeleton: `<Workspace>` arranges `WorkspaceHeader`, a `TabbedContentArea` (accessible WAI-ARIA tabs), `TimelineArea`, `SummaryPanel`, and `ActionPanel`. Every record surface (customer, identity case, fulfilment job, …) composes this same layout so navigation between record types feels identical.

### Command Palette (`components/command/*`)
Global ⌘K / Ctrl K universal search via `CommandPaletteProvider` + an accessible dialog (combobox→listbox, ↑/↓/Enter/Esc, focus management, scroll-into-view, body-scroll lock). Ranking/grouping is the pure, tested `lib/search/core.ts`. The mock command set derives navigation entries from the real nav, so they never drift. This is the intended future navigation system.

## Accessibility

Semantic landmarks (`nav[aria-label]`, `main`, `aside`); `aria-current` on active nav; icon-only controls carry labels; focus-visible rings on every interactive element; the palette and tabs implement their full ARIA keyboard patterns; progress indicators expose `role="progressbar"` + values; motion respects `prefers-reduced-motion`; colour is never the sole signal (chips pair tone with a label/dot).

## Domain concepts (Sprint 2)

### Readiness — a reusable concept, not a metric
`lib/readiness/core.ts` is the **single source of truth**: a pure `computeReadiness` over weighted factors, the agreed **3 bands** (Ready for Protection ≥ 85 / Nearly Ready 60–84 / Not Ready < 60), and exhaustive band metadata. No surface defines its own thresholds or labels. The customer → factors mapping lives in `lib/customers/readiness.ts`. Reusable UI: `ReadinessBadge`, `ReadinessCard` — used by Mission Control, the Customers index, the Customer Workspace, and (ready for) queues and recommendations.

### Protection Status
Distinct from Readiness: *is the customer protected right now?* — `PROTECTED` / `IN_PROGRESS` / `UNPROTECTED`, derived in `lib/customers/readiness.ts`, rendered by `ProtectionStatusBadge`. A customer can be "Ready for Protection" yet not protected until their card is active.

### The single Customer Workspace
`/customers/[id]` is the **only** customer view. It composes the Sprint-1 `<Workspace>` framework with the Readiness domain (header badges, Readiness Card, Summary, Quick Actions, Timeline, tabbed Overview/Tasks/Notes). Every entry point (Mission Control, command palette, Customers index) opens it. **Never build a feature-specific customer view** — configure a queue that delivers the operator here instead. Operational Tasks are derived from the customer's readiness gaps.

### Engines
`lib/engines/*` are deterministic, output-only functions feeding each Mission Control surface (Briefing, Health, Work, Alert, Activity, Protected Lives, Recommendation). Widgets depend on the output contract, never the engine body, so an engine can later be replaced (e.g. with an LLM) without touching UI.

### Mock-only affordances & feedback
Inert actions (no backend yet) use `MockActionButton`, which gives explicit toast feedback ("… is mocked in Sprint 2") via `ToastProvider` rather than doing nothing. The "Mock session" pill and the Internal Notes "not saved · mock" hint keep the demo honest.

## Extending

1. New primitive → `components/ui`, semantic tokens only, `cn()` for classes, forward refs where native.
2. New enum (status/priority/role/domain) → add to the union **and** its exhaustive `Record` (the compiler enforces it).
3. New queue → configure `<Queue>`; never fork it.
4. New record surface → compose `<Workspace>`; never invent a new layout.
5. New logic with branching → put it in a **pure core** under `lib/` and unit-test it; keep components thin.
