# EMRID Backend Implementation Guide

> **Canonical engineering handbook for EMRID Operations.** This document is the single source of truth for all future backend engineering. It stands alone: an engineer, contractor, technical architect, or AI agent can begin implementing EMRID using only this document. It is organised by architecture, not by history, and is written as established fact. Companion documents in this repository — `PRODUCT_ARCHITECTURE.md`, `UX_PRINCIPLES.md`, `DESIGN_LANGUAGE.md`, `DESIGN_SYSTEM.md`, `OPERATOR_HANDOFF.md` — expand specific facets; this guide is the spine that ties them together.

---

## 1. Executive Summary

**EMRID ("Emergency Rescue Identification")** is a healthcare identity platform. Its founding promise: *"the card that could save your life when you can't speak for yourself."* A first responder taps an official EMRID NFC device and instantly sees a patient's **public** emergency medical information at a public URL — no login, no app. Everything else about the patient stays private and patient-controlled.

EMRID is delivered as **two products on one shared infrastructure**:

- **EMRID Patient Platform** — the patient-owned application: registration, profiles, emergency medical data with field-level visibility, devices/cards, documents, identity submission, and the public emergency responder route. It already runs on real AWS (Cognito + DynamoDB + S3).
- **EMRID Operations** — the staff-facing operating system that runs the business: customer readiness, identity verification, card fulfilment, practitioner approval, and customer support. This is the codebase this guide governs.

The two products are **separate codebases that share infrastructure** (one DynamoDB table, one Cognito user pool, one S3 bucket, one audit framework, one set of key builders). Operations reads the state the Patient Platform produces and writes the operational decisions the Patient Platform reads back.

**Purpose of the backend.** The product, UX, information architecture, and design language are frozen. The frontend and the entire operational model run today on in-memory mock adapters. The backend's job is to make that model durable and live on the shared AWS infrastructure — **without redesigning anything**. Every adapter is selected by a fail-closed flag; flipping the flags swaps mock for AWS with no change to call sites, components, or domain logic.

**The implementation mission:**

> **Achieve the first Production Protected Life.**

A Protected Life is a customer who is verified, carries an active EMRID card, and whose critical emergency information is in place — such that an NFC tap surfaces it. The entire backend programme is measured against making one real customer reach that state in production. Feature count is not the metric; a single end-to-end production journey is.

---

## 2. Product Philosophy

These principles are immutable. Every implementation decision must be defensible against them.

- **Protection is the point.** Every surface, queue, and action moves a customer toward Protected. **Protected Lives** is the company's north-star metric and the visual focal point of the product.
- **Mission Control, not a dashboard.** The homepage is an operational command centre. It answers four questions — *what needs attention, who needs attention, what should I do next, are we becoming more protected* — then hands the operator off to focused work. It never becomes a wall of reports.
- **Work is the unit of operational truth.** Anything to be done is a **Work Item** owned by the **Work Engine**. Queues, Today's Work, and a customer's Active Work are all *projections* of Work Items.
- **The Customer Workspace is the product.** There is exactly **one** customer view. Every queue, search result, and Mission Control item opens into it. Most future effort refines the Workspace rather than adding screens.
- **One Workspace. One Queue. One Source of Truth.** One Customer Workspace, one generic Queue framework, one Work Engine. Sameness is a feature: operators learn one surface; engineers extend one set of components.
- **Automation before AI.** Solve with deterministic rules and good defaults first. The operational "engines" are deterministic today and swappable for richer or LLM-backed implementations later — behind unchanged contracts. AI is reserved for where it clearly outperforms rules.
- **Every click reduces work.** A click that doesn't advance real work is a defect. The operator should never wonder what to do next.
- **Progress over reports; whitespace over density; honest affordances.** Show movement toward protection, not static metrics. Calm beats crowded. Nothing pretends to work — unwired actions say so.

---

## 3. Frozen Product Architecture

The product architecture is final. The following spine is the organising structure of the entire platform:

```
        Mission Control          operational command centre
              │
              ▼
        Protection Engine        the higher-level domain; Protected Lives is the north star
              │                  (Readiness is ONE component of Protection)
              ▼
         Work Engine             owns all operational work; the source of operational truth
              │
              ▼
       Queue Projections         filtered, read-only views of Work Items (one per domain)
              │
              ▼
      Customer Workspace         the one place work is actioned (any Work Item type)
              │
              ▼
       Protected Lives           the outcome every action moves toward
```

Work flows **down**; outcomes roll **up**.

**Layer responsibilities and rationale:**

| Layer | Responsibility | Why it exists |
|---|---|---|
| **Mission Control** | Orient and prioritise; answer the four questions; hand off to focused work. | An operator's first screen must triage, not report. |
| **Protection Engine** | Model how protected the customer base is. Protected Lives + per-customer Protection State. Readiness is one component. | The company optimises for Protected Lives, not for any single domain. Framing readiness as a component keeps every domain pointed at one outcome. |
| **Work Engine** | Own all operational work as Work Items; generate from state + rules; classify, prioritise, and define the transition/action model. | A single source of operational truth means every surface agrees on "what is there to do." Adding a domain is adding *work types*, not a new system. |
| **Queue Projections** | Present a filtered, read-only slice of Work Items per domain and deliver the operator into the Workspace. | Queues are *views*, not owners. One queue implementation guarantees consistent behaviour and inherits every future improvement for free. |
| **Customer Workspace** | The single place a customer is viewed and any Work Item is actioned. | One surface to learn; minimal context-switching; no per-domain views. |
| **Protected Lives** | The figure every action moves; Mission Control's focal point. | Closes the loop — work exists to increase protection. |

**What must never change:** the existence and ordering of these layers; the rule that Work Items are the source of operational truth; that queues are projections; that there is one Customer Workspace; that Protection sits above Readiness. New capability slots into this spine; it does not alter it.

---

## 4. Frozen Information Architecture

The navigation and page structure are frozen so future capability never requires re-navigation.

```
Sidebar (persistent, desktop/tablet):
  Mission Control                 ← /mission-control   (homepage; / and /dashboard redirect here)
  ────────────── Operations
  Customer Readiness              ← /customer-readiness
  Identity Verification           ← /identity-verification   (queue projection: domain = IDENTITY)
  Card Fulfilment                 ← /card-fulfilment          (queue projection: domain = FULFILMENT)
  Practitioners                   ← /practitioners
  Customer Support                ← /customer-support
  Work Items                      ← /work-items
  ────────────── Leadership
  Executive                       ← /executive
  Administration                  ← /administration

  Customers index                 ← /customers      (search-oriented entry point; not in sidebar)
  Customer Workspace              ← /customers/[id]  (THE single customer view)
  Design reference                ← /design         (QA/documentation; not in sidebar)
```

- **Mission Control** is the command centre. **Customers** (`/customers`) is a deliberately minimal, search-oriented entry point (search + list + readiness + protection + open-workspace; no editing, no detail page). The **Customer Workspace** (`/customers/[id]`) is the only customer view.
- **Queue pages** (Identity Verification, Card Fulfilment, and every future domain) are projections of the Work Engine rendered through one generic queue component. They never own data.
- **Search** is search-first: a global **Command Palette** (⌘K / Ctrl K) is the primary navigation system; the sidebar is the map, not the route.
- **Workspace tabs** are **Overview / Active Work / Notes**. New record information is added as Workspace sections or tabs — never as a new screen.

These are frozen because the entire value proposition (low cognitive load, one workspace, search-first) depends on operators learning one stable surface. Backend work attaches to these routes; it does not move them.

---

## 5. Domain Model

EMRID's business domain is organised around **Protection**.

```
                        ┌─────────────────────────────┐
                        │        Protection           │  (top-level concept)
                        │  ProtectionState per customer│
                        └─────────────┬───────────────┘
                       composed of    │
        ┌───────────────┬─────────────┼───────────────┬────────────────┐
        ▼               ▼             ▼               ▼                ▼
   Identity        Emergency       Devices        Membership      (future:
  (verification)  (medical info,   (NFC cards)   (plan/billing)   guardianship,
                   contacts)                                        consent)
        │               │             │
        └──────┬────────┴─────────────┘
               ▼
          Readiness  (0–100 score over weighted factors → 3 bands)
               │
               ▼
        Work (WorkItems generated from readiness gaps & events)
               │
               ▼
     Operational History (append-only audit)
               │
               ▼
        Protected Lives (aggregate outcome)
```

| Concept | Definition | Relationships |
|---|---|---|
| **Protection** | Whether a customer is protected *right now*, and how close they are. The organising concept. | Composed of Identity, Emergency, Devices (+ future signals). |
| **Identity** | Verification state of the customer's real-world identity (raw ID isolated; masked elsewhere). | An input to Readiness (highest weight) and to Protection Status. |
| **Emergency** | Critical medical info + emergency contacts. | An input to Readiness; the payload surfaced on the public tap. |
| **Devices** | NFC cards. Status `PENDING → ACTIVE → SUSPENDED ⇄ ACTIVE`, terminal `REVOKED`/`REPLACED`. | Card ACTIVE is required for PROTECTED; resolves the public tap by token. |
| **Membership** | Plan/lifecycle. Never affects emergency access. | Orthogonal to Protection. |
| **Practitioners** | Approved clinicians and practices (approval workflow, patient access grants). | A work domain; not on the Protection critical path. |
| **Readiness** | A 0–100 score over weighted factors, classified into 3 bands. **One component of Protection.** | Computed from Identity + Emergency + Devices + profile completeness. |
| **Protection State** | `{ status, readiness, … }` — the bundle. `status` ∈ `PROTECTED / IN_PROGRESS / UNPROTECTED`. | The Protection Engine's per-customer output. |
| **Work** | A unit of operational work (`WorkItem`). | Generated from readiness gaps/events; projected into queues and the Workspace. |
| **Operational History** | Append-only audit of every meaningful action. | Powers timelines; never mutated. |
| **Protected Lives** | The count of customers currently protected. | The north-star aggregate. |

**Critical distinction — Readiness vs Protection Status.** Readiness measures *how close* a customer is (a continuous score). Protection Status measures *whether they are protected now* (a discrete state). A customer can be "Ready for Protection" (high readiness) yet not `PROTECTED` until their card is active. These never collapse into one field.

---

## 6. Protection Engine

**Purpose.** Produce the platform's protection picture: the per-customer Protection State and the aggregate Protected Lives figure that anchors Mission Control.

**Inputs.** A customer's Identity status, Emergency completeness, emergency contact count, profile completeness, and Device/card status — assembled from repository-backed state.

**Outputs.**
- **Readiness** — `ReadinessResult { score: 0–100, band, factors[] }`. Pure, deterministic, the single source of readiness truth (`lib/readiness/core.ts`).
- **Protection Status** — `PROTECTED | IN_PROGRESS | UNPROTECTED` (`lib/customers/readiness.ts`).
- **Protection Summary / Protection State** — `lib/protection/state.ts` bundles `{ status, readiness }` and is the seam where future components (device health, consent, guardianship) attach.

**Readiness model (frozen).** Weighted factors summing to 100, three bands:

| Factor | Weight | Met when |
|---|---|---|
| Profile complete | 15 | profile basics present |
| Identity verified | 30 | identity status = VERIFIED |
| Emergency info added | 25 | emergency medical info present |
| Emergency contact added | 15 | ≥ 1 contact |
| Card active | 15 | device status = ACTIVE |

| Band | Threshold | Label |
|---|---|---|
| `READY` | ≥ 85 | Ready for Protection |
| `NEARLY` | 60–84 | Nearly Ready |
| `NOT_READY` | < 60 | Not Ready |

`computeReadiness(factors)` is generic (any weighted-factor score); the customer→factors mapping (`customerReadinessFactors`) is the domain binding. Thresholds and labels are defined once and never duplicated per surface.

**Why a weighted score rather than a checklist.** A binary checklist cannot express "this customer is one step from protection" versus "this customer has barely started." A 0–100 score lets Mission Control rank *who needs attention* by proximity to protection, lets the Work Engine escalate the work that closes the largest gaps, and gives operators a single legible number. Identity carries the highest weight (30) because it gates everything downstream; the card carries 15 because it is the final, fast step once everything else is in place. The weights are policy, not physics — they live in one function and can be re-tuned without touching any surface.

**Worked example.** A customer with a complete profile, verified identity, emergency info, and one contact, but no active card, scores `15 + 30 + 25 + 15 = 85` → band `READY` ("Ready for Protection"), Protection Status `IN_PROGRESS` (no active card yet). Completing card fulfilment adds the final 15 → `100`, and because identity is verified + emergency info present + card active, Protection Status flips to `PROTECTED`. This exact transition is the operational core of a Protected Life.

**Protection Summary.** Beyond the per-customer state, the engine produces the aggregate picture Mission Control renders: the **Protected Lives** count (customers at `PROTECTED`), a **readiness distribution** (how many customers sit in each band), and a **needs-attention** ordering (lowest readiness first). These are pure functions over the customer set (`lib/customers/queries.ts`) and recompute as repository state changes — so an identity approval visibly shifts the distribution and the Protected Lives figure once aggregation is live.

**LLM independence.** The Protection Engine is deterministic. Mission Control's surfaces are fed by deterministic "engines" (`lib/engines/*`) with output-only contracts. An engine's body may later be replaced by an LLM (e.g. natural-language briefings, smarter prioritisation) without changing any consumer.

**Current implementation status.** Readiness, Protection Status, and Protection State are fully implemented and used by the Workspace, Customers index, and Mission Control. Identity and card facets are repository-backed (`getCustomerState` reads the Profile and Device repositories); emergency-info, contacts, and profile-completeness facets are still fixture input pending their repositories.

**Future roadmap.** (1) Emergency repository so all readiness factors are repository-backed; (2) a Protected-Lives aggregation that counts real PROTECTED customers rather than a mock figure; (3) optional recommendation intelligence (the `recommendation` engine is a deterministic stub today).

---

## 7. Work Engine

The Work Engine is the heart of EMRID Operations. It owns all operational work. Queues, Today's Work, and Active Work are projections of it; nothing else creates or holds work.

### 7.1 WorkItem

The atomic unit. The UI shape (`lib/work/types.ts`) and the persisted shape (`lib/data/work-record.ts`) are mapped 1:1 by `lib/work/record.ts` (`recordToWorkItem` / `workItemToRecord`) so persistence field names and UI names never drift.

| Field | Meaning |
|---|---|
| `workItemId` / `id` | Stable identifier |
| `workType` / `type` | The kind of work (see WorkType) |
| `workDomain` / `domain` | The domain → which queue projects it |
| `status` | Lifecycle state |
| `priority` | LOW / MEDIUM / HIGH / URGENT |
| `step` | Progress through a multi-step type's flow (default 0) |
| `assignment` | `{ assigneeName: string \| null, assignedAt? }` |
| `source` | Why the work exists |
| `customerId` | The customer the work concerns (links to the Workspace) |
| `title`, `subjectName`, `nextAction` | Display fields |
| `dueAt` / `dueDate`, `createdAt`, `updatedAt` | Timestamps |

### 7.2 WorkType, WorkDomain, Priority, Status, Source, Assignment

**WorkType** (`lib/work/work-type.ts`) — the most specific classification; each maps to exactly one domain via an exhaustive `Record`:

| WorkType | Domain | Default priority |
|---|---|---|
| `VERIFY_IDENTITY` | IDENTITY | HIGH |
| `ISSUE_CARD` | FULFILMENT | HIGH |
| `COMPLETE_PROFILE` | READINESS | LOW |
| `ADD_EMERGENCY_INFO` | READINESS | MEDIUM |
| `ADD_EMERGENCY_CONTACT` | READINESS | LOW |
| `APPROVE_PRACTITIONER` | PRACTITIONER | MEDIUM |
| `RESOLVE_SUPPORT_QUERY` | SUPPORT | MEDIUM |

**WorkDomain** — `READINESS | IDENTITY | FULFILMENT | PRACTITIONER | SUPPORT`. Each domain has a queue route (`WORK_DOMAIN_HREF`).
**WorkStatus** — `OPEN | IN_PROGRESS | BLOCKED | WAITING | DONE | CANCELLED` (exhaustive metadata: label + tone). `DONE` and `CANCELLED` are terminal.
**Priority** — `LOW | MEDIUM | HIGH | URGENT` (exhaustive metadata: label, tone, rank).
**WorkSource** — `READINESS_GAP | MANUAL | SYSTEM | CUSTOMER_REQUEST`.
**WorkAssignment** — `{ assigneeName, assignedAt? }`; `null` assignee ⇒ unassigned.

### 7.3 Timeline

Each Work Item has a derived lifecycle timeline (`lib/work/timeline.ts`) — created (with source), assigned, status transitions — rendered via the shared `TimelineArea`. Deterministic today; sourced from the audit trail when live.

### 7.4 Step-based flows, transitions, and the action model

Actions are a property of a Work Item's **type + status + step**, not of any one domain (`lib/work/actions.ts`). Each type declares an ordered list of forward **steps** (the happy path) plus an optional **defer**. Generic transitions (start / resume / unblock / block / reopen) are derived from status.

```
WORK_TYPE_FLOW (illustrative):
  VERIFY_IDENTITY : steps=[ Approve identity → DONE ]            defer=[ Request resubmission → WAITING ]
  ISSUE_CARD      : steps=[ Start encoding → IN_PROGRESS,
                            Mark encoded   → IN_PROGRESS,
                            Mark dispatched→ DONE ]
  (others)        : steps=[ Mark complete/captured/etc → DONE ]  defer where applicable
```

`workActions({ type, status, step })` returns the available `WorkAction[]` (`{ id, label, toStatus, kind, advances? }`). OPEN/IN_PROGRESS expose the next forward step (+ defer, + Block when in progress); WAITING/BLOCKED expose only the recovery action; terminal states expose Reopen. **The single generic `WorkItemRow` renders these for any type — there is no domain-specific action UI.** Card Fulfilment is multi-step; Identity is single-step; both use the same model. This was the validation that proved the architecture generalises.

### 7.5 Transition model

A UI transition is mapped to its persistence meaning by the pure `planTransition` core (`lib/work/transition-core.ts`):

```
planTransition(type, toStatus):
  VERIFY_IDENTITY + DONE → IDENTITY_DECISION (VERIFIED)
  VERIFY_IDENTITY + other→ AUDIT_ONLY
  ISSUE_CARD      + DONE → CARD_ACTIVATION
  ISSUE_CARD      + other→ AUDIT_ONLY
  (unmapped type)        → UNSUPPORTED   (fails closed — never a silent no-op)
```

`executeTransition(deps, input)` (`lib/work/transition-service.ts`) is the testable orchestrator. Given injected repositories it:
1. Moves the Work Item (the repository rewrites **both** projection items — see §8).
2. Applies the implied shared-state write: `IDENTITY_DECISION` → `ProfileRepository.setIdentityDecision`; `CARD_ACTIVATION` → `DeviceRepository.markCardActive`.
3. Appends an append-only audit event.

The `transitionWorkItem` **server action** (`lib/work/server-actions.ts`) is a thin wrapper: `requireOpsUser` → map the UI item to a record → `executeTransition` with the real (flag-selected) repositories → serialisable result. The Workspace's `WorkItemRow` calls it optimistically, confirms on the server result with a success/error toast, refreshes to re-project, and reverts on failure. **No transition fails silently.**

### 7.6 Generation rules

Work is **generated from state** (`lib/work/rules.ts`, `lib/work/generate.ts`): every outstanding readiness factor becomes a Work Item, typed by `FACTOR_WORK_TYPE`, prioritised by the type default and **escalated one level when the customer is unprotected** (the operational expression of the Protected Lives north star). Due dates are derived deterministically from priority. Non-readiness work (practitioner approvals, support) is manual/system-sourced.

### 7.7 Projection & queue philosophy

Reads are projections (`lib/work/projections.ts`): `todaysWork` (Mission Control), `activeWork(customerId)` (Workspace), `queueForDomain(domain)` (queues). **Queues never own work.** A queue is a filtered view of Work Items that drops the operator into the Workspace. This is enforced physically in the persistence layer (§8): a queue read hits a `WORK#<domain>` partition; it never queries or scans the customer/profile data.

**Why queues never own work — the failure mode this prevents.** If each queue owned its own list, the same underlying reality (a customer needs their identity verified) could exist as a row in the Identity queue, a different row in a "readiness" view, and a third notion inside the Workspace — three representations that drift out of sync, three places to update on every transition, and no single answer to "what is actually outstanding for this customer." By making the Work Item the one record and every surface a projection, a single transition updates one truth and every view re-derives consistently. The Ops work index (§8) makes this physical: there is literally one set of Work Item items; queues and the Workspace are different *reads* of them.

**Worked example — the life of an identity Work Item.**

```
1. Producer (Stream→Lambda) sees a customer submit identity → creates a
   VERIFY_IDENTITY work item (domain IDENTITY), status OPEN, priority HIGH
   (URGENT if the customer is unprotected). Dual-written:
     WORK#IDENTITY            / STATUS#OPEN#PRIORITY#HIGH#DUE#…#WORK#<id>
     PROFILE#<customerId>     / WORK#OPEN#<id>
2. It appears in the Identity queue (Query WORK#IDENTITY) and in the customer's
   Active Work (Query PROFILE#<customerId> begins_with WORK#).
3. An IDENTITY_OFFICER opens the queue row → lands in the Customer Workspace →
   reviews the ID document (S3 presigned GET) and the isolated raw ID item.
4. "Approve identity" → transitionWorkItem → executeTransition:
     • work item DONE (TransactWrite rewrites BOTH projection items)
     • Profile.identityVerificationStatus = VERIFIED  (setIdentityDecision)
     • audit IDENTITY_VERIFIED appended
5. Re-projection: the item drops out of the active queue/Active Work; the
   customer's readiness recomputes upward; Protection Status may advance.
```

This is the same shape every domain follows. Card Fulfilment differs only in being multi-step (encode → dispatch) and ending in `CARD_ACTIVATION` instead of `IDENTITY_DECISION`.

---

## 8. Queue Architecture

**One generic queue.** There is a single generic queue UI (`components/queue/Queue.tsx`) and a single work-queue wrapper (`components/work/WorkQueue.tsx`). Every operational queue is this component fed a different projection — never a new implementation.

- **Identity Verification** = `WorkQueue` over `queueForDomain("IDENTITY")`.
- **Card Fulfilment** = `WorkQueue` over `queueForDomain("FULFILMENT")`.
- **Future queues** (Support, Practitioner, …) = `WorkQueue` over `queueForDomain(<DOMAIN>)` + a route page. Nothing else.

**Capabilities (all in the generic component):** filters (status, priority, assignee — assignees derived from the items), sorting (priority, due date), cross-page bulk selection, bulk actions, pagination, and status/priority chips. All data work is delegated to a pure, tested core (`lib/queue/core.ts`: `processQueue` = filter → sort → paginate; selection helpers).

**Navigation.** Every queue row is a link into `/customers/[customerId]` — the Workspace. Queues deliver operators into the Workspace; they are not a destination.

**Server/client boundary rule.** `WorkQueue` is a client component; pages pass it only **serialisable** props (e.g. `primaryBulkLabel: string`). It constructs bulk-action handlers and icons internally. Passing functions or icon components from a server page across the boundary throws at runtime — this is a permanent constraint, not a bug.

**Why queues are projections.** A new domain costs ≈ a page + a projection (+ a flow entry if multi-step). Consistency is guaranteed; improvements to the one queue benefit every department; and the persistence design means no profile is ever scanned to build a queue.

---

## 9. Customer Workspace

**Purpose.** The single surface where a customer is understood and any Work Item is actioned. Every queue, Mission Control item, and command-palette result resolves here.

**Layout (frozen)** — composed from the reusable Workspace framework (`components/workspace/*`):

```
┌───────────────────────────────────────────────────────────────┐
│  WorkspaceHeader   (eyebrow: CUSTOMER · <id>; name; Protection  │
│                     + Readiness badges; primary actions)        │
├──────────────────────────────────────┬────────────────────────┤
│  Main (2/3)                           │  Rail (1/3)             │
│   TabbedContentArea:                  │   Readiness Card        │
│     • Overview  (narrative + Active   │   Summary Panel         │
│        Work)                          │   Quick Actions         │
│     • Active Work · N                 │                        │
│     • Notes                           │                        │
│   TimelineArea (activity)             │                        │
└──────────────────────────────────────┴────────────────────────┘
```

| Region | Content | Source |
|---|---|---|
| **Summary** | email, mobile, location, joined, identity, card | repo-backed customer state |
| **Protection** | Protection Status badge | derived (identity + card + emergency) |
| **Readiness** | score ring + band + factor checklist | Readiness engine |
| **Timeline** | activity events | derived (audit when live) |
| **Active Work** | the customer's open Work Items, each with generic actions | `WorkItemRepository.listForCustomer` |
| **Notes** | internal staff notes | ephemeral today; server-backed later |
| **Quick Actions** | contextual primary action + common follow-ups | generic actions / future server actions |

**Why it is the only customer workspace.** One surface means operators learn once and context-switch minimally; every work type renders generically; and the platform never fragments into "Identity customer view," "Fulfilment customer view," etc. **Future record information is added as a Workspace section or tab — never as a new screen, and never as a domain-specific page.**

---

## 10. Shared AWS Architecture

EMRID Operations and the Patient Platform share **one** of everything that matters:

```
                ┌──────────────────────── one AWS account ───────────────────────┐
                │                                                                 │
   Patient      │   Cognito user pool   DynamoDB single table   S3 bucket   audit │   Operations
   Platform ───▶│   (public app client) (emrid-…-app, GSI1/GSI2)(private)  (table)│◀─── (this repo)
   (customer)   │                                                                 │   (staff)
                └─────────────────────────────────────────────────────────────────┘
```

- **One Cognito** user pool (public app client, no secret). Patients and Ops staff authenticate against it; Ops roles come from Cognito groups.
- **One DynamoDB table** with GSI1 (token lookup) and GSI2 (audit profile timeline). Both products read and write it.
- **One S3 bucket** (private; Block Public Access on) for documents.
- **One audit framework** — append-only events in the shared table.
- **Shared entities** (Profile, Identity, Emergency, Device, Document, Audit) and **shared key builders** define the table contract.

**Mirror strategy.** Because the two products are separate repositories with no shared package, EMRID Operations carries a **frozen mirror** of the shared contract: `lib/data/entities.ts` (entity shapes) and `lib/data/aws/keys.ts` (key builders + item reconstructors) are byte-for-byte compatible with the Patient Platform's equivalents. A contract test (`tests/shared-contract.test.ts`) pins the key strings.

**Risk.** The mirror cannot detect drift in the Patient Platform. The durable mitigation is to extract the key design + shared entity types into a **shared package** consumed by both products with a CI alignment check. Until then, any change to the table contract is a deliberate, cross-product change reflected in both repositories simultaneously. (See §17.)

**Why two codebases, not a monorepo.** The Patient Platform and EMRID Operations have different audiences (patients vs staff), different deployment surfaces, different release cadences, and different security postures, but one operational dataset. Keeping them as separate applications that share *infrastructure and a data contract* — rather than one monolith or a shared code package today — keeps each product independently deployable and reasoned about, at the cost of the mirror discipline described above. The contract, not the code, is the integration point.

**Constraint.** EMRID Operations **never provisions AWS infrastructure**. Resources, IAM, DNS, and deployment are operator-owned (§18). The codebase describes what it needs and hands it off.

---

## 11. Repository Architecture

The repository pattern is the spine of all data access.

```
            getXRepository()  ── pickMigrated(mock, aws) ──▶  USE_MOCK_DATA ? Mock : Dynamo
                  │                                                    │
         interface (lib/data/types.ts)                       DynamoDeps (injectable client)
                  │                                                    │
        ┌─────────┴─────────┐                              real client │ fake doc.send (tests)
   Mock impl            Dynamo impl
 (in-memory store)   (shared table, server-only)
```

- **Interfaces** (`lib/data/types.ts`) are pure contracts; methods return `null`/`[]` rather than throwing "not found."
- **Factory** (`lib/data/index.ts`): `pickMigrated(mock, aws)` returns the DynamoDB implementation when `USE_MOCK_DATA=false`, else the mock. Getters: `getProfileRepository`, `getDocumentRepository`, `getAuditRepository`, `getWorkItemRepository`, `getDeviceRepository`.
- **Mock adapters** operate on a shared in-memory store (`lib/data/mock/store.ts`), backed by `globalThis` so mutations survive Next's per-request module re-evaluation within a process.
- **AWS adapters** (`lib/data/aws/*`) use an **injectable `DynamoDeps`** (`{ doc, table }`); production resolves a lazy singleton document client built from the compute IAM role via the default provider chain (no AWS keys in env). Tests inject a fake `doc.send` that captures commands — so DynamoDB behaviour is verified **without AWS**.
- **Fail-closed configuration** (`lib/config`): three independent flags — `USE_MOCK_AUTH`, `USE_MOCK_DATA`, `USE_MOCK_UPLOADS`. They default to mock **only outside production**; production is detected by `APP_ENV=production` *or* `NODE_ENV=production`, so a deployed build can never silently run mock even if the flag env vars don't reach the runtime. An explicit `USE_MOCK_*=true|false` always wins.

**Current repository status:** Profile (incl. isolated identity + identity decision), Document (read), Audit (append-only), Work Item (dual-write + transition), Device (dual-write + activate). **Future repositories:** Emergency profile, Membership, Practitioner/Practice (read for the Practitioner queue), and a Protected-Lives aggregate read.

**Testing strategy (the reason this whole layer is verifiable without AWS).** EMRID tests pure cores and repositories, not framework glue:

- **Pure cores** — readiness, work actions, transition planning, projections, queue filtering/sorting/pagination, session/role mapping, config resolution — are plain functions with no Next/AWS imports, unit-tested directly.
- **Mock adapters** — tested by manipulating the in-memory store and asserting behaviour (e.g. "approving identity moves the work item out of the active projections").
- **DynamoDB adapters** — tested with an injected **fake `doc.send`** that captures the commands. Tests assert the exact keys, conditions, and command types (e.g. `setIdentityDecision` issues a conditional `UpdateCommand`; the audit write uses `attribute_not_exists(PK)`; a work transition issues one `TransactWriteItems` that deletes the old pair and puts the new pair; `getByToken` queries GSI1 and never a `Scan`). This proves the AWS code is correct **without provisioning AWS**.
- **Server actions** are deliberately thin and not unit-tested directly (they touch `next/headers`); their logic lives in the testable `executeTransition` orchestrator, which is tested with mock repositories.

The result is a suite that validates the entire seam — including the journey to Protected — on every commit, with mock as the runnable default. When the operator flips the flags, only the adapter implementations change; the contracts the tests pin remain identical.

---

## 12. DynamoDB Design

EMRID uses a **single-table design** on the shared table (with `GSI1` and `GSI2`). All access patterns are served by base-table `PK`/`SK` queries or the two GSIs. **No table scans exist anywhere in the codebase.**

**Why single-table.** Two products share one operational dataset; a single table with a disciplined key design lets both read and write the same entities transactionally, keeps related items co-located in a partition (a customer's profile, identity, emergency, documents, devices, and work all live under or beside `PROFILE#<id>`), and avoids cross-table joins that DynamoDB does not provide. The cost is up-front key design; the benefit is that every hot access pattern is a single `Query`.

### 12.1 Key patterns (the contract)

```
Profile             PK = PROFILE#<profileId>          SK = PROFILE
Identity (raw)      PK = PROFILE#<profileId>          SK = IDENTITY          ← isolated, sensitive
Emergency           PK = PROFILE#<profileId>          SK = EMERGENCY
Document (metadata) PK = PROFILE#<profileId>          SK = DOCUMENT#<docId>
Device (canonical)  PK = DEVICE#<deviceId>            SK = DEVICE            + GSI1PK = TOKEN#<token>
Device (by profile) PK = PROFILE#<profileId>          SK = DEVICE#<deviceId>
Audit               PK = AUDIT#<targetType>#<targetId> SK = TS#<ts>#<eventId> + GSI2PK = PROFILE#<id> (when profile-related)
Work (queue proj.)  PK = WORK#<domain>                SK = STATUS#<status>#PRIORITY#<priority>#DUE#<dueAt>#WORK#<id>
Work (customer idx) PK = PROFILE#<customerId>         SK = WORK#<status>#<id>
```

### 12.2 Entity notes

- **Profile** carries identity *verification metadata* (status, masked number, verified-at, notes) and the verification level — never the raw ID number.
- **Identity** is an isolated item holding the raw ID number, readable only by authorised server code (Ops review). It is never logged, audited, or serialised to a client. *(Plaintext today — see §17.)*
- **Emergency** stores the full emergency profile; filtering for the public surface happens in application code, never in the query.
- **Document** stores metadata only; the bytes live in S3 (`storageKey`).
- **Device** uses a canonical item (looked up by id and, via GSI1, by opaque token) plus a per-profile duplicate so a customer's devices list with one base-table query. Status changes rewrite **both** items together. Device status is the shared enum (`PENDING/ACTIVE/SUSPENDED/REVOKED/REPLACED`) — the fulfilment encode/dispatch sub-steps live on the Work Item, not the device.
- **Audit** is append-only (`attribute_not_exists(PK)`); profile-related events also index on GSI2 for the profile activity timeline (newest first).

### 12.3 The Ops Work Index (queue projections)

Work Items are **dual-written**: a **queue projection** item (`PK = WORK#<domain>`) and a **customer index** item (`PK = PROFILE#<customerId>`). Both carry the full record; both encode `status` in their SK. A queue reads its domain partition; the Workspace reads the customer partition. A transition is a single `TransactWriteItems` that **deletes the old pair and puts the new pair** (status changed ⇒ SKs changed), keeping both projections consistent atomically.

```
Issue:       TransactWrite [ Put queueItem, Put customerItem ]
Transition:  TransactWrite [ Delete old queueItem,    Put new queueItem,
                             Delete old customerItem,  Put new customerItem ]
```

### 12.4 GSI usage & access patterns

| Access pattern | How |
|---|---|
| Get a profile / identity / emergency / document | base-table `GetItem` / `Query` on `PROFILE#<id>` |
| List a customer's documents / devices / work | `Query PROFILE#<id> begins_with(SK, …)` |
| Identity / Fulfilment / any queue | `Query WORK#<domain>` |
| Device by NFC token (public tap) | `Query GSI1 (GSI1PK = TOKEN#<token>)` |
| Customer / target audit timeline | `Query GSI2 (GSI2PK = PROFILE#<id>)` or base `AUDIT#…` |

**No-scan philosophy.** Listing "all profiles at identity status X" is deliberately **not** supported by a profile-status query — that pattern would require a scan or a status GSI. Instead, identity work is a **Work Item**, and the Identity queue is a projection over `WORK#IDENTITY`. The legacy `ProfileRepository.listByIdentityStatus` therefore fails closed in the DynamoDB adapter rather than scanning.

**Consistency & transaction notes.** Dual-written entities (work items; devices) are always written through `TransactWriteItems`, so the two physical items never diverge: either both project the new state or neither does. Creates use `attribute_not_exists(PK)` for idempotency; the identity-decision update uses `attribute_exists(PK)` so it can never create a phantom profile. Reads are eventually consistent by default (acceptable for operational queues and the Workspace); if a future flow needs read-your-write within a request, use a strongly-consistent `GetItem` on the base table (never available on GSIs).

**Capacity & cost notes.** The dominant access patterns are point lookups and small partition queries (a customer's items; a domain's queue page). Pagination is applied in the queue layer; partitions are bounded by realistic per-domain and per-customer work volumes. There is no scan, so cost scales with reads/writes actually performed, not table size.

**Known limitations.** (1) GSI count is intentionally minimal — **adding a GSI is an escalation, never a default**; new access patterns are first attempted with the dual-write/index-item idiom. (2) Customer-index work items live in the `PROFILE#` partition, so very high per-customer work volumes share a partition (acceptable at expected scale). (3) The queue projection SK encodes `priority` and `status` as enum strings; their lexical order is not their semantic order, so final display ordering is applied in the projection layer (`byPriorityDesc`, due-date ascending) — the SK exists for partitioning and status-prefix range reads, not for final sort.

---

## 13. Authentication

EMRID uses **credential-free Cognito authentication** for a public app client — no AWS SDK for auth, no client secret, no admin APIs.

- **Sign-in** (`lib/auth/cognito.ts`) calls the Cognito IdP JSON API directly via `fetch` with `USER_PASSWORD_AUTH` against the public app client. Sign-up/confirm/forgot-password follow the same pattern. Requires `ALLOW_USER_PASSWORD_AUTH` on the app client.
- **JWT verification** (`lib/auth/verifier.ts`) uses `aws-jwt-verify` (`CognitoJwtVerifier`, `tokenUse: "id"`) against the user pool JWKS. The verified payload yields `sub`, `email`, optional `name`, and `cognito:groups`.
- **Role mapping.** Ops staff roles come from `cognito:groups` mapped to `OpsRole` (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `CUSTOMER_SUPPORT`, `IDENTITY_OFFICER`, `FULFILMENT_OFFICER`, `PRACTITIONER_MANAGER`, `EXECUTIVE`). Groups must be named exactly as the role tokens. `ROLE_META` holds display metadata; permission enforcement is a future layer on top of these roles.
- **Identity key decision.** `OpsUser.userId === Cognito sub`. All authorisation keys off `sub`.
- **Cookies.** Tokens live only in httpOnly cookies (`emrid_ops_id_token`, `emrid_ops_refresh_token`; `Secure` in production, `SameSite=Lax`, `path=/`). No token in JS-readable storage.
- **Resolution & guards** (`lib/auth/server.ts`, pure core in `lib/auth/session.ts`). `getCurrentOpsUser()` short-circuits in mock mode (returning the demo user **without reading cookies**, so mock pages stay statically renderable); otherwise it reads the ID-token cookie, verifies it, and maps claims → `OpsUser`. `requireOpsUser()` redirects to `/login` when there is no active session.
- **Fail-closed.** A non-active user resolves to `null`; the Edge middleware adds a cheap cookie-presence gate in Cognito mode and is inert in mock mode (it never *disables* gating on a missing flag).

**Sign-in & verification flow.**

```
Sign in:   email/password ─▶ server action ─▶ Cognito InitiateAuth (USER_PASSWORD_AUTH, public client)
                                            ─▶ ID + refresh tokens ─▶ httpOnly cookies (Secure in prod)
Per request: requireOpsUser()
   mock mode  ─▶ demo OpsUser (no cookie read; route stays static)
   cognito    ─▶ read ID-token cookie ─▶ aws-jwt-verify (JWKS, tokenUse:"id")
                                       ─▶ map { sub, email, name, cognito:groups } → OpsUser
                                       ─▶ null when absent/invalid ⇒ redirect /login
```

**Why credential-free.** Using the public app client over `fetch` keeps the dependency surface tiny and the deployment **credential-free** — no AWS access keys, no client secret, no admin APIs. Tokens stay server-side in httpOnly cookies. The trade-off (the password transits the Ops backend over TLS) is acceptable given the server-side, httpOnly design and mirrors the Patient Platform exactly.

**Future:** refresh-token rotation (to end the ~1h forced logout), a permission layer enforcing `OpsRole` capabilities per action/queue, and `__Host-` cookies + a tightened CSP.

---

## 14. Storage

Documents are stored in **S3** (private bucket, Block Public Access on, SSE). EMRID never exposes a public object URL.

- **Presigned URLs.** The document-access service (`lib/documents/*`, selected by `USE_MOCK_UPLOADS`) issues short-lived presigned URLs. Operations needs **presigned GET** (download) to **review the identity document** during verification, forcing an `attachment` filename. Uploads are performed by the customer/Patient Platform; Operations is read-only on documents.
- **Object keys** are opaque (`profiles/<profileId>/documents/<uuid>-<filename>`) and stored on the document metadata item, never derived client-side.
- **Injectable deps** (`S3Deps`) let tests verify URL construction without AWS.
- **Future uploads** (e.g. Ops-attached evidence) reuse the same service with a presigned PUT, mirroring the Patient Platform.

---

## 15. Audit

EMRID keeps an **append-only** operational history.

- **Event model:** `{ eventId, eventType, actorType (CUSTOMER/PRACTITIONER/OPS/SYSTEM), actorId?, targetType, targetId, timestamp, metadata }`. Metadata is ids/refs only — never raw ID numbers, tokens, emails, or medical values.
- **Append-only guarantee:** writes use `attribute_not_exists(PK)` with a unique SK (`TS#<timestamp>#<eventId>`); there is no update or delete path.
- **Timeline generation:** profile-related events index on GSI2 (`GSI2PK = PROFILE#<id>`), queried newest-first to build a customer's activity timeline. Every Ops transition appends an event (`IDENTITY_VERIFIED`, `CARD_ACTIVATED`, `OPS_WORK_TRANSITION`, …).
- **Future EventBridge integration:** audit events are the natural source for downstream eventing — a DynamoDB Stream (or explicit publish) → EventBridge can drive notifications, the Work Item producer (§17), and analytics, without changing the append-only model.

---

## 16. Current Backend Status

| Subsystem | Status | Implemented | Validated | Outstanding | Risks / Dependencies |
|---|---|---|---|---|---|
| Config + adapter flags | ✅ Done | 3 fail-closed flags, region, cognito | Unit-tested | — | — |
| Repository spine (factory, DynamoDeps) | ✅ Done | factory + injectable client | Tested via mock + fake `doc.send` | — | — |
| Shared key contract mirror | ✅ Done | entities + key builders | Contract-test pinned | Shared package | Drift vs Patient Platform |
| Profile + Identity repo | ✅ Done | read, identity decision write | Mock + dynamo tests | — | enum-value reconciliation |
| Document repo + S3 read | ✅ Done | metadata read + presigned GET | Tested | — | bucket CORS (operator) |
| Audit repo | ✅ Done | append-only + GSI2 timeline | Tested | — | — |
| Work Engine (types/rules/gen) | ✅ Done | full domain + generation | Tested | producer for live events | — |
| Work Item repo (dual-write) | ✅ Done | queue + customer projections | Tested (incl. consistency) | — | — |
| Device repo + fulfilment | ✅ Done | dual-write, activate, token GSI1 | Tested | — | — |
| Transition seam + server action | ✅ Done | identity + card persistence | Journey-tested | other domains | wired for IDENTITY + FULFILMENT |
| Auth (Cognito seam) | ✅ Code complete | IdP fetch, verify, cookies, roles | Pure-core tested | live pool wiring | operator + `/login` route |
| Customer state (repo-backed) | ✅ Done | identity + card from repos | Tested | emergency facets | Emergency repo |
| Mission Control engines | ✅ Done | deterministic engines | — | LLM (optional) | — |
| Protected Lives aggregate | ⚠️ Mock | hero figure | — | real aggregation | — |
| Emergency repo | ❌ Not started | — | — | full read/write | blocks full readiness |
| Public `/e` tap (Ops side) | ❌ Not started | `getByToken` ready | — | responder surface | mostly Patient Platform |
| Work Item producer | ❌ Not started | — | — | Stream→Lambda | EventBridge/Streams |
| Live AWS (all adapters) | ❌ Not connected | code complete | — | provision + flip flags | operator |

**Verified end-to-end (mock):** the full Ops journey — approve identity → encode → mark encoded → mark dispatched → device ACTIVE → customer **PROTECTED at 100% readiness** — persists through the repository seam and is covered by a journey test.

---

## 17. Current Technical Debt

Honest inventory. None of these block the architecture; all are implementation work.

1. **Mock stores are not durably cross-request.** The in-memory store is backed by `globalThis` so it survives module re-evaluation within a process, but it resets on a cold serverless instance and diverges across instances. **Mock is for development only; real durability is DynamoDB.**
2. **Emergency repository missing.** Emergency-info, emergency-contact, and profile-completeness readiness factors are still fixture input (`MOCK_CUSTOMERS`). Until an Emergency repository exists, those factors are not repository-backed, so readiness is only partially live (identity and card are live).
3. **Shared-contract mirror.** The key design + entity shapes are mirrored, not shared. Drift in the Patient Platform is undetectable here. **Mitigation: extract a shared package + CI check.** Also reconcile entity enum *values* (`ProfileStatus`, `VerificationLevel`, `IdentityVerificationStatus`, device status) against the Patient Platform before enabling live data.
4. **Work Item producer.** Work Items are mock-seeded. In production, a producer (recommended: DynamoDB Stream → Lambda, or a Patient-Platform write using this key contract) must create Work Items when real identity/card events occur.
5. **AWS wiring.** No resources are provisioned; all AWS adapters are code-complete but unverified against live AWS. Cognito `/login` and refresh-token rotation are not yet built on the Ops side.
6. **Serverless persistence semantics.** Optimistic UI + `router.refresh()` assume the server action's write is visible to the subsequent render. This holds with DynamoDB; with the mock store it holds only within a warm process.
7. **Plaintext raw ID number.** The isolated `IDENTITY` item is plaintext (relies on DynamoDB KMS-at-rest + TLS). Encrypt/tokenise before scaling.
8. **Protected Lives is a mock figure.** The hero number is not yet a real aggregate of PROTECTED customers.
9. **Notes are ephemeral.** Internal notes live in client state; they need a server action + persistence.
10. **Mission Control customer widgets** read repo-backed identity/card but still rely on fixtures for the remaining facets (see #2).

---

## 18. Operator Responsibilities

The following are **operator-owned** and must be performed manually (the codebase never provisions infrastructure). Full detail lives in `OPERATOR_HANDOFF.md`.

- **AWS account & resources:** reuse the shared DynamoDB table (with GSI1 + GSI2), Cognito user pool (public app client, `ALLOW_USER_PASSWORD_AUTH`), and private S3 bucket. Do not create parallel resources.
- **Cognito:** create Ops staff **groups named exactly** as the `OpsRole` values; ensure ID tokens carry `email` and `cognito:groups`.
- **IAM (least-privilege compute role):** DynamoDB `GetItem`/`Query`/`PutItem`/`UpdateItem`/`DeleteItem`/`TransactWriteItems` on the table + `Query` on GSI1 and GSI2; S3 `GetObject` on `profiles/*`. **No `Scan`. No AWS keys in env** (use the compute role via the default provider chain).
- **Amplify:** deploy the Next.js SSR app; `amplify.yml` writes server-only env vars into `.env.production` before build; `serverActions.allowedOrigins` already allow-lists the Ops origin.
- **Environment variables:** `APP_ENV=production`, `USE_MOCK_AUTH=false`, `USE_MOCK_DATA=false`, `USE_MOCK_UPLOADS=false`, `APP_AWS_REGION`, `DYNAMODB_TABLE_NAME`, `S3_DOCUMENT_BUCKET`, and the `NEXT_PUBLIC_COGNITO_*` values (set **before build** so they inline).
- **Work Item producer:** stand up the Stream→Lambda (or equivalent) that creates Work Items on real submissions.
- **Verification:** run the five gates (`typecheck`, `lint`, `test`, `build`, `npm audit`) and verify the live journey once flags are flipped.

---

## 19. First Protected Life — the complete production journey

The first Production Protected Life is one real customer traversing the entire platform end-to-end. The journey spans both products operating on the shared table: the Patient Platform owns the customer-facing steps and the public tap; EMRID Operations owns the operational steps that move the customer toward protection. The hand-off between them is **shared state**, never a direct call — Operations reads what the Patient Platform writes (an identity submission becomes a Work Item) and writes what the Patient Platform reads back (a verified identity, an active card).

Every step, with ownership (P = Patient Platform, O = EMRID Operations, S = shared infrastructure):

| # | Step | Owner | Mechanism |
|---|---|---|---|
| 1 | Customer registers | P | Cognito sign-up (public client) |
| 2 | Customer logs in | P | Cognito `USER_PASSWORD_AUTH`; httpOnly tokens |
| 3 | Customer completes profile | P | Profile item on shared table |
| 4 | Customer completes emergency profile | P | Emergency item |
| 5 | Customer uploads identity documents | P | S3 presigned PUT + Document metadata + isolated Identity item; Profile identity status = PENDING |
| 6 | **Protection Engine evaluates readiness** | O | `getCustomerState` + readiness engine; customer appears as NOT_READY/NEARLY |
| 7 | **Work Engine generates operational work** | O/S | producer creates a `VERIFY_IDENTITY` Work Item (dual-write); it surfaces in the Identity queue + the customer's Active Work |
| 8 | **Operations approves identity** | O | Workspace → Approve identity → `transitionWorkItem` → Work Item DONE + `setIdentityDecision(VERIFIED)` + audit; readiness recomputes upward |
| 9 | **Card Fulfilment processes the card** | O | Fulfilment queue → Workspace → Start encoding → Mark encoded → Mark dispatched; completion → `markCardActive` |
| 10 | Customer activates the card | P | Device → ACTIVE (production: customer activation; mock: fulfilment completion activates) |
| 11 | **Customer becomes Protected** | O/S | identity VERIFIED + emergency present + card ACTIVE ⇒ Protection Status PROTECTED; readiness 100% |
| 12 | Emergency NFC tap displays the profile | P | public route resolves the device by token (GSI1) → filtered public emergency view |

Steps 6–9 and 11 are the Operations contribution and are **implemented and verified in mock today**. Steps 1–5, 10, 12 are the Patient Platform's, operating on the same shared table. Achieving the **first Production** Protected Life is a matter of connecting AWS, standing up the Work Item producer, and exercising this journey live.

---

## 20. Remaining Implementation Roadmap

Prioritised by value toward the first Production Protected Life. **Backend first; no redesign.**

1. **Operator AWS connect** — provision/wire Cognito, table (GSI1/GSI2), bucket, IAM; build the Ops `/login` route; flip `USE_MOCK_*=false`. Unblocks everything.
2. **Work Item producer** — Stream→Lambda creating Work Items on real identity/card submissions.
3. **Emergency repository** — make the remaining readiness factors repository-backed; readiness becomes fully live.
4. **Protected Lives aggregation** — count real PROTECTED customers for the Mission Control hero and distribution.
5. **Public `/e` tap** — confirm/finish the responder surface using `getByToken` (largely Patient Platform; Ops reads shared device state).
6. **Identity-number encryption/tokenisation** — remove the plaintext debt before scaling.
7. **Shared contract package + CI check** — eliminate mirror drift.
8. **Notes persistence + permission layer** — server-back internal notes; enforce `OpsRole` permissions.
9. **Additional domains** — Support and Practitioner queues via the established recipe (a page + a projection + a flow entry), then their transition persistence.

---

## 21. Engineering Rules (immutable)

1. **One Customer Workspace.** No per-domain or feature-specific customer pages.
2. **One Queue framework.** Queues are configuration + a projection — never a new implementation.
3. **One Work Engine.** All work is a Work Item from the Work Engine.
4. **Protection before Work.** Work exists to increase protection; model protection state first.
5. **Queues are projections.** They never own work; they deliver operators into the Workspace.
6. **Work Items are the source of operational truth.** Today's Work, Active Work, and queues are derived.
7. **No profile scans.** Never scan the profiles/customer data to build a queue or list. Use the Ops work index.
8. **No new GSI without escalation.** Attempt every access pattern with base-table keys + the dual-write idiom first.
9. **No backend redesign.** Implement the frozen architecture faithfully.
10. **Reuse before rebuild.** Reuse the shared spine, the generic components, and the existing patterns.
11. **Fail closed.** Mock only outside production; unsupported/unknown states deny rather than no-op silently.
12. **Architecture before optimisation.** Correctness and the spine first; performance tuning second.
13. **Automation before AI.** Deterministic engines first; LLMs only behind the same output contracts.
14. **Server→client props are serialisable.** Build handlers/icons inside client components.
15. **Pure core + thin wrapper.** Branching logic lives in unit-tested pure cores; components and server actions stay thin.

---

## 22. Definition of Done

The implementation phase is complete only when **all** of the following are true in production:

- [ ] Production backend connected (`USE_MOCK_*=false` in a deployed environment).
- [ ] Cognito live (Ops staff sign in; roles from groups).
- [ ] DynamoDB live (shared table, GSI1/GSI2; no scans).
- [ ] S3 live (identity document review via presigned GET).
- [ ] Work Item producer operational (real submissions create Work Items).
- [ ] Identity approval operational (persists Profile decision + audit + re-projection).
- [ ] Card fulfilment operational (encode → dispatch → device ACTIVE).
- [ ] Customer activation operational (device reaches ACTIVE in production).
- [ ] Public NFC tap operational (token → filtered emergency view).
- [ ] **First Production Protected Life achieved** (one real customer reaches PROTECTED end-to-end).

Each must pass the five quality gates: `typecheck`, `lint`, `test`, `build`, `npm audit` (0 vulnerabilities).

---

## 23. Mission for Future Engineering

The architecture is complete. The UX is frozen. The product is frozen.

- **Do not redesign the platform.**
- **Do not introduce new product concepts.**
- **Do not modify the information architecture.**
- **Implement the platform faithfully.**

The spine — Mission Control → Protection Engine → Work Engine → Queue Projections → Customer Workspace → Protected Lives — is settled and validated across multiple operational domains. Identity was not special; Card Fulfilment was not special; both proved the model generalises. Every future capability is a configuration of the existing frameworks, not a new structure.

Future engineering work is **implementation, not product discovery.** Connect the backend, faithfully and fail-closed, behind the architecture already established. The single objective is:

> **Achieve the First Production Protected Life.**

Everything in this handbook serves that one outcome. Build to it.
