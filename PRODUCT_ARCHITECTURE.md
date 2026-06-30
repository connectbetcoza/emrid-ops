# EMRID Operations — Product Architecture

> The canonical operational architecture and **architectural law**. Read this before adding a domain or a screen. Frozen at Sprint 4 after validation through Identity Verification and Card Fulfilment. Companion docs: [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md) (philosophy), [`DESIGN_LANGUAGE.md`](./DESIGN_LANGUAGE.md) (visual + interaction language), [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) (component catalogue).

## The spine

```
Mission Control            ← operational command centre
      ↓
Protection Engine          ← the higher-level domain; Protected Lives is the north star
      ↓                       (Readiness is ONE component of Protection)
Work Engine                ← owns all operational work; the source of operational truth
      ↓
Queue Projections          ← filtered, read-only views of Work Items (per domain)
      ↓
Customer Workspace         ← the one place work is actioned (any Work Item type)
      ↓
Protected Lives            ← the outcome every action moves toward
```

Work flows **down**; outcomes roll **up**. A queue never creates work; the Workspace never invents a per-domain view; Readiness never stands alone above Protection.

## Layers — responsibility & why

### Mission Control (`app/(ops)/mission-control`, `lib/engines/*`)
**Responsibility:** answer four questions at a glance — *what needs attention, who needs attention, what should I do next, are we becoming more protected.* **Not** a reporting dashboard.
**Why:** an operator's first screen must orient and prioritise, then hand off to focused work. Surfaces are fed by deterministic **engines** with output-only contracts so the data source (rules today, LLM later) can change without touching the UI.

### Protection Engine (`lib/protection/`, `lib/readiness/`)
**Responsibility:** model how protected the customer base is. **Protected Lives** is the north star; **Readiness** is *one component* of a customer's `ProtectionState` (alongside live Protection Status and future device/consent/guardianship signals).
**Why:** the company optimises for Protected Lives, not for any single domain. Framing Readiness as a component (not a standalone metric) keeps every domain pointed at the same outcome.

### Work Engine (`lib/work/`)
**Responsibility:** own all operational work as `WorkItem`s — generate them from state (readiness gaps) + rules, classify them by `WorkType`→`WorkDomain`, prioritise (with escalation for unprotected customers), and define the generic action/transition model.
**Why:** a single source of operational truth means every surface agrees on "what is there to do." Adding a domain is adding *work types*, not a new system.

### Queue Projections (`lib/work/projections.ts`, `components/work/WorkQueue.tsx`)
**Responsibility:** present a filtered, read-only slice of work — `queueForDomain(items, DOMAIN)` rendered through the one generic `WorkQueue` (filter/sort/bulk/paginate/chips). **Deliver the operator into the Customer Workspace.**
**Why:** queues are *views*, not owners. One queue implementation guarantees every department's queue behaves identically and inherits every future improvement for free.

### Customer Workspace (`app/(ops)/customers/[id]`, `components/workspace/*`)
**Responsibility:** the single place a customer is viewed and work is actioned. Renders **any** `WorkItem` type generically (`WorkItemRow` + `workActions`).
**Why:** one workspace means operators learn one surface and context-switch less. Identity, Fulfilment, Support, Practitioner, and Device all resolve here — there is never an "X customer view."

### Protected Lives (outcome)
**Responsibility:** the figure every action moves. Surfaced as Mission Control's focal point.
**Why:** it closes the loop — work exists to increase protection, and the dashboard shows whether it is.

## Architectural law (do not violate without an explicit decision)

1. **One Work Engine.** All work is a `WorkItem` from `lib/work/`, generated from state + rules — never minted inside a screen.
2. **Work Items are the source of operational truth.** Anything "to be done" is a `WorkItem`. Today's Work, Active Work, and every queue are *derived*.
3. **One Queue framework.** A single generic queue (`components/queue/Queue.tsx` + `components/work/WorkQueue.tsx`). New queues are configuration + a projection — never a new implementation.
4. **Queues are projections only.** `queueForDomain` → `WorkQueue`. Queues hold no work and own no state; selecting a row opens the Customer Workspace.
5. **One Customer Workspace.** `/customers/[id]` is the only customer view. No per-domain customer pages.
6. **Generic Work actions.** `workActions(type, status, step)` + `WorkItemRow`. A new type declares its `steps[]` — never a new action component.
7. **Protection is the higher-level domain.** Readiness is one component of `ProtectionState`. Never reintroduce Readiness as a standalone top-level concept.
8. **Deterministic engines, swappable later.** `lib/engines/*` and work transitions are deterministic now; they route through a server action / LLM later behind unchanged contracts.
9. **No backend until the experience is exceptional.** No AWS / DynamoDB / Cognito / CRUD yet. Repository seams are reserved, not built.

## Adding a new domain — the validated recipe

A new domain (Support, Practitioner, Device, …) is, end to end:

1. **Work types** — add to `WorkType` + `WORK_TYPE_META` (label, `WorkDomain`, icon, default priority, next action) in `lib/work/work-type.ts`; add the queue route to `WORK_DOMAIN_HREF`.
2. **Generation/rules** — if state-derived, map it in `lib/work/rules.ts` + `lib/work/generate.ts`; else add manual/system items. Escalation + due-date rules are shared.
3. **Actions** — add the type's `steps[]` (+ optional `defer`) to `lib/work/actions.ts`. Single-step or multi-step, same model.
4. **Queue** — a route rendering `<WorkQueue items={queueForDomain(MOCK_WORK_ITEMS, "DOMAIN")} primaryBulkLabel="…" />`. No new queue component.
5. **Workspace** — nothing to build: the Workspace renders the new type via `WorkItemRow` and surfaces it in **Active Work**.

Identity (single-step) and Card Fulfilment (multi-step) both fit this recipe unchanged.

## Key modules (source of truth)

| Concern | Module |
|---|---|
| Work item shape + `step` | `lib/work/types.ts` |
| Work types → domain/queue | `lib/work/work-type.ts` |
| Generation from readiness gaps | `lib/work/generate.ts`, `lib/work/rules.ts` |
| Projections (queue/today/active) | `lib/work/projections.ts` |
| Generic actions / transitions | `lib/work/actions.ts` |
| Generic work-item rendering | `components/work/WorkItemRow.tsx` |
| Generic queue | `components/queue/Queue.tsx` + `components/work/WorkQueue.tsx` |
| Customer Workspace | `app/(ops)/customers/[id]/page.tsx` + `components/workspace/*` |
| Protection (top domain) | `lib/protection/state.ts` |
| Readiness (a component of protection) | `lib/readiness/core.ts` + `lib/customers/readiness.ts` |
| Mission Control engines | `lib/engines/*` |
| Auth architecture (mock) | `lib/auth/*`, `lib/config` |

## Known technical risks (tracked)

- **RSC boundary discipline.** Passing functions/icon-components from a server page into a client component throws at runtime (not at typecheck/build). Client components (e.g. `WorkQueue`) take only serializable props and build handlers/icons internally.
- **Ephemeral transitions.** Work-item status changes live in component state (no persistence). The backend sprint moves transitions to a server action while preserving the action shape.
- **`step` ↔ `status` coupling.** Multi-step progress is `WorkItem.step`, derived at generation. Keep generation and flow definitions in sync.
- **Mock dates / static prerender.** Acceptable for mock; revisit with real data.

## Backend extension pattern (when it begins)

The architecture is designed so backend work slots *behind* it:

- **Data:** replace each `lib/**/mock.ts` and the engines' bodies with a repository read; shapes are unchanged. Follow the Patient Platform's repository + factory + adapter-flag pattern (`USE_MOCK_DATA`, etc., already in `lib/config`).
- **Transitions:** `workActions` returns the same actions; `WorkItemRow` calls a server action instead of local state. The action `id`/`toStatus` contract is the seam.
- **Auth:** wire Cognito into `lib/auth/server.ts` (`verifiedOpsUser`) + middleware; `requireOpsUser` and all call sites stay.
- **Shared infra:** reuse the Patient Platform's DynamoDB single table, Cognito pool, and S3 — EMRID Operations is a separate product on shared infrastructure.
