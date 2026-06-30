# EMRID Operations

The cloud-native operational platform for the EMRID healthcare-identity programme — the staff-facing counterpart to the patient-owned **EMRID Patient Platform**.

> **Programme boundary.** EMRID Operations is a **separate product** from the Patient Platform (which lives in `../emrid`). It reuses the same patterns and, in later sprints, the same shared infrastructure (DynamoDB single table, Cognito pool, S3 bucket, IAM patterns), but it is its own application and codebase. See the Patient Platform's `EMRID_PATIENT_CONTEXT/00` and `/07` for the documented split.

## Status

**Sprint 1 — Foundation & Design System.** The cloud-native shell: application shell, navigation, theme/design system, the Operations authentication *architecture*, and the reusable Mission Control / Search / Workspace / Queue frameworks.

**Sprint 2 — Mission Control & the Customer Workspace.** The homepage is **Mission Control** (an operational command centre, not a reporting dashboard) with **Protected Lives** as its north-star focal point. **Readiness** is a first-class, reusable domain concept (a per-customer score + 3 bands). The **single Customer Workspace** (`/customers/[id]`) is the product — every queue, Mission Control item, and command-palette result opens into it; there are no feature-specific customer views. Dashboard widgets are deterministic **engines** (Briefing/Health/Work/Alert/Activity/ProtectedLives/Recommendation), swappable for richer/LLM implementations behind stable contracts.

**There is no business logic, CRUD, AWS, or backend yet** — everything runs on mock data. Future capabilities plug into this foundation without redesigning navigation, layout, routing, or components.

> **Start with [`EMRID_BACKEND_IMPLEMENTATION_GUIDE.md`](./EMRID_BACKEND_IMPLEMENTATION_GUIDE.md)** — the canonical, standalone engineering handbook for all backend work (architecture, domain model, DynamoDB design, repositories, auth, the First Protected Life journey, status, debt, operator responsibilities, and the immutable engineering rules).
>
> **Read [`PRODUCT_ARCHITECTURE.md`](./PRODUCT_ARCHITECTURE.md) before adding a domain or a screen.** It is the canonical spine and the architectural law: one Work Engine, Work Items as the source of operational truth, one Queue framework, queues as projections only, one Customer Workspace, and Protection as the domain above Readiness. New domains follow a fixed recipe (work types → rules → actions → a queue page → done) — validated by Identity and Card Fulfilment.

## Stack

Next.js 15.5 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 3.4 (class dark mode + CSS-variable tokens) · Vitest 4 · lucide-react · clsx + tailwind-merge · zod.

Pinned to match the Patient Platform's toolchain. AWS SDK / auth libraries are intentionally **absent** (no AWS wiring in scope yet).

## Running locally

Node 22 (see `.nvmrc`). On this machine Node is not on `PATH` by default:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
npm install
npm run dev          # http://localhost:3000 (or -p 3002 alongside the patient app)
```

The app runs fully offline on mock adapters — no AWS credentials or env required.

## Quality gates

```bash
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # next lint
npm test             # vitest run
npm run build        # next build (NEVER while `next dev` is running)
npm audit            # must be 0 vulnerabilities
```

## Project structure

```
app/
  (ops)/             # authenticated shell: layout + all routes
    mission-control/ # Mission Control — the command centre (homepage)
    customers/       # minimal index + [id] = the single Customer Workspace
    dashboard/       # → redirect to /mission-control (legacy)
    customer-readiness/ identity-verification/ card-fulfilment/
    practitioners/ customer-support/ work-items/
    executive/ administration/        # placeholder section routes
    design/          # design-system & framework reference (not in primary nav)
    error.tsx        # shell error boundary
  layout.tsx         # root layout + theme no-flash script
  page.tsx           # → /mission-control
components/
  ui/                # design-system primitives (Button, Card, Badge, …)
  theme/             # ThemeProvider + ThemeToggle
  app/               # shell (sidebar, header, search trigger, user menu)
  command/           # command palette (provider + dialog)
  feedback/          # ToastProvider + MockActionButton
  queue/             # reusable Queue + QueueCard
  workspace/         # Workspace skeleton + the five named regions
  dashboard/         # Mission Control widgets (engines' UI) + Protected Lives hero
  readiness/         # ReadinessBadge / ReadinessCard (reusable domain UI)
  customers/         # index, list item, protection badge, workspace panels (Active Work, …)
  work/              # WorkItemCard, WorkItemRow (generic actions), WorkQueue (generic)
  feedback/          # ToastProvider + MockActionButton
lib/
  config/            # env chokepoint (three fail-closed adapter flags)
  auth/              # roles, pure session core, server guard, provider, mock user
  engines/           # deterministic operational engines (LLM-swappable)
  protection/        # Protection state (Readiness is one component)
  readiness/         # the reusable Readiness domain (pure core + bands)
  customers/         # Customer model, readiness bridge, queries, workspace builders, mock
  queue/  search/    # pure cores (filter/sort/paginate; rank/group)
  work/              # Work Engine: types, work-type, rules, generate, projections, actions, timeline, mock
  navigation.ts utils.ts format.ts greeting.ts
tests/               # Vitest — pure cores (incl. readiness + customers)
middleware.ts        # Edge route guard (fail-closed; inert in mock mode)
```

See [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) for the component catalogue, tokens, and framework usage.
