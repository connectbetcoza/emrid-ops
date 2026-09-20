# EMRID OPERATIONS — AUTHORITATIVE CURRENT STATE (Context Migration Package)

> **Written 2026-08-28 at the retirement of the prior engineering session.** This is the
> single source of context for a brand-new engineering session. Everything here was
> verified against the repositories at the HEADs below; AWS state is asserted ONLY where
> the prior session held operator evidence, otherwise marked **OPERATOR VERIFICATION
> REQUIRED (OVR)**. Companion docs (all current): `PROJECT_HANDOVER.md` (historical,
> pre-pilot era — superseded by this file where they conflict), `OPERATOR_HANDOFF.md`
> (operator runbook, §13–§15 observability/backup/health), `RISK_REGISTER.md`,
> `EDGE_PROTECTION_RUNBOOK.md`, `PRODUCT_ARCHITECTURE.md`, `EMRID_BACKEND_IMPLEMENTATION_GUIDE.md`.

**Verified anchors (2026-08-28):**
- `emrid-ops` HEAD **`2121eb7`** "Add assisted device support with producer-owned protection crossings" — clean tree, **in sync with `origin/main`**.
- `emrid` (Patient) HEAD **`75db11b`** "Add My Medical Records and harden S3 upload verification" — in sync with `origin/main`, **BUT the working tree is DIRTY**: an
  uncommitted, external (non-engineering-session) in-progress change across 5 files
  (+130 −9): an RFC 6266/5987 `Content-Disposition` encoding fix so presigned GETs
  don't fail on non-Latin-1 (e.g. emoji) filenames — touches `lib/documents/keys.ts`,
  `lib/documents/s3-upload-service.ts`, document repositories, `lib/data/types.ts`.
  Status: IMPLEMENTED LOCALLY, NOT COMMITTED, NOT PUSHED, provenance unknown to
  engineering — **ask Michael whose work this is and whether to finish/commit it.**
- Tests: **Ops 311 passed / 31 files**; **Patient 361 passed / 43 files**. `npm audit`: **0 vulnerabilities in both** (via `overrides`: `sharp ^0.35.3`, `brace-expansion ^5.0.9`).
- Lambda artifact: `emrid-ops/producer.zip` — **178,189 bytes**, SHA-256
  `0cc36aeb5d05459349cc8dacc5d5c34b9dd3a500e7a8d7585748edc8a40c8642`, committed in `2121eb7`, loads under Node, contains `applyDeviceCrossing`/`deviceCrossingCandidate`.

---

## ENGINEERING / OPERATIONS BOUNDARY (authoritative project rule)

**Claude = Engineering**: inspect, design, code, refactor, test, build, package Lambda
artifacts, prepare migrations/deployment commands/rollback/certification plans, produce
Operator Handoffs. **Claude MUST NOT deploy AWS or use AWS credentials.** (A read-limited
CLI profile `emrid-dev` exists on this machine and has historically been used for
read-only verification Queries with explicit CPTO tolerance; the standing instruction in
recent sprints is **no AWS actions** — ask before using it.)

**Michael (CPTO) = Operations**: AWS, Amplify, Lambda deploys, IAM, Cognito, CloudFront,
WAF, Route53/DNS, secrets, production deployments, rollback execution, Go/No-Go.
Every engineering slice ends in a pre-deployment report + Operator Handoff, then a
pause for explicit CPTO approval before commit/push. **Commits/pushes happen only on
explicit approval.** House commit style: imperative subject, body explaining the why,
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## SECTION 1 — EXECUTIVE PROJECT STATE

**EMRID ("Emergency Rescue Identification")** is a South African healthcare identity
platform: an NFC card resolves, with no login, to a patient's public emergency medical
information at `/e/<deviceToken>` — "the card that could save your life when you can't
speak for yourself." Two Next.js products share one AWS estate: the **Patient Platform**
(`emrid`: patient app + practitioner portal + public emergency route + marketing) and
**EMRID Operations** (`emrid-ops`: the staff operating system).

**Maturity:** production-deployed pilot-preparation phase. V1 has achieved: the **First
Production Protected Life** (John Doe, `profile_58af8916…`, EMR-2J3JZ2) and **Protected
Life #2** (Michael Edwards `…be8eee75`, both verified against the live table by the
prior session); live identity verification, card fulfilment with real customer
activation state-sync, practitioner management under the Administration-owned model,
customer support (work items + notes), CMS Stage 1 (contact corrections), per-action
RBAC, go-live hardening (observability seams, security headers, honest dashboards), a
family/membership alignment layer, and CMS Stage 2 assisted device support with
producer-owned protection crossings (**pushed, deployment OVR — see §15**).

**Before broader production:** deploy+certify Stage 2a+2b (§15/§23); close the pilot
blockers in `RISK_REGISTER.md` §A (WAF/rate limiting R-2, alarms R-3 — both operator
tasks with runbooks); resolve plaintext-ID encryption (R-4) before real-identity scale;
and audit the two **new, un-reviewed Patient commits** (`bc47d0a` onboarding wizard,
`75db11b` My Medical Records) for Ops alignment impact — they landed outside the prior
session and have never been examined by Ops engineering (§2).

## SECTION 2 — REPOSITORY MAP

Both under `~/Desktop/EMRID/`. Next.js 15 App Router, TypeScript, Tailwind (semantic
tokens only), Vitest. **No shared package** — Ops carries a frozen byte-compatible
mirror of the shared contract.

**`emrid` (Patient + Practitioner)** — patient app (`app/app/*`), practitioner portal
(`app/practitioner/*`), public `/e/[deviceToken]`, claim flow (`app/claim`), family
(`app/app/family` + `app/family/invite`), membership (`app/app/membership` +
`lib/billing`), Help Centre (`app/app/help`, `/faq`), marketing. Auth in `lib/auth`
(credential-free Cognito, grant-based `profile-access-core`, practitioner guards).
Data layer `lib/data/{types,index,mock,aws}`; key contract `lib/data/aws/keys.ts`;
entities `types/*`. HEAD `75db11b`, **dirty tree (see anchors — uncommitted download-filename fix)**,
**361 tests / 43 files** (passing WITH the uncommitted changes in place), build+audit
clean. ⚠️ `bc47d0a` + `75db11b` are NOT engineering-session work — un-audited (likely touch
registration flow and documents/medical-records domain; alignment impact unknown).
⚠️ `emrid/.env.local` (git-ignored) points local dev at **real AWS** — always run local
dev with explicit `USE_MOCK_AUTH=true USE_MOCK_DATA=true USE_MOCK_UPLOADS=true`.

**`emrid-ops` (Operations)** — staff shell `app/(ops)/*` (mission-control, 5 queue
pages, customers index + `[id]` workspace, practitioners roster/[id]/onboard,
executive, administration, design reference); `app/login`; `app/api/{health,client-error}`.
Core libs: `lib/auth` (session gate + `permissions.ts` RBAC core), `lib/work` (Work
Engine + producer + transition service), `lib/customers` (state, directory-core,
workspace builders, support/contact/device orchestrators + actions), `lib/practitioners`
(manage core/service/actions), `lib/data` (mirror entities/keys, repos: Profile,
Emergency, Document, Audit, WorkItem, Device, Aggregate, Directory, Practitioner, Note,
Family), `lib/devices/token.ts` (canonical generator mirror), `lib/observability`,
`lib/engines` (live briefing/work/protected-lives only), `lambda/work-item-producer.ts`
(thin adapter over `lib/work/producer.ts`), `scripts/{reconcile-report,backfill-directory}.mjs`.
HEAD `2121eb7`, clean, **311 tests / 31 files**, build+audit clean.

**Shared-contract seams:** `emrid-ops/lib/data/entities.ts` + `lib/data/aws/keys.ts`
mirror Patient's `types/*` + `lib/data/aws/keys.ts`; pinned by
`tests/shared-contract.test.ts` (key strings, item round-trips, exhaustive enum value
sets, Ops audit-event map). Cross-product changes ship both repos together, pinned both
sides. Patient-side drift is NOT auto-detected (tracked risk R-11) — hence the
un-audited Patient commits matter.

## SECTION 3 — AWS / PRODUCTION ARCHITECTURE

**Operator-confirmed at some point by the prior session** (all current-state claims OVR
unless re-verified):
- **Amplify**: Ops app at `https://main.d3dm6cbwkmq8gr.amplifyapp.com` (served
  `/api/health` with `appEnv:production`, all mock flags false, `cognitoConfigured:true`
  on 2026-07-26). `ops.emrid.co.za` did **not** resolve as of late July. Patient app
  domain: moved from `dev.emrid.co.za` to **`www.emrid.co.za`** by CPTO decision
  (2026-07-26); `allowedOrigins` includes www/apex/uat/*.amplifyapp.com. Whether DNS
  cutover + card re-encoding (CPTO chose **Option B: re-encode existing cards**, no
  redirect) completed: **OVR**.
- **Cognito**: shared pool `eu-west-1_B3YWPgLWW`, public client (`USER_PASSWORD_AUTH`,
  no secret). Ops roles = groups named exactly as `OpsRole` values. Dr Michael Edwards
  practitioner login exists: sub `32358424-d061-704e-c722-c1317e333d64`, CONFIRMED
  (operator-created 2026-07-04).
- **DynamoDB**: single shared table **`emrid-dev-app`** (production data in a dev-named
  table — tracked R-14), GSI1 (token), GSI2 (audit timeline), Streams
  `NEW_AND_OLD_IMAGES`. Live reads on 2026-07-03 confirmed: 11 customer directory
  entries, aggregate `AGGREGATE#PROTECTED_LIVES/CURRENT = {protected:2, inProgress:1, v3}`.
- **S3**: `emrid-dev-documents` (private, presigned only). PITR/versioning: **OVR**
  (checklist in `OPERATOR_HANDOFF.md` §14).
- **Lambda**: `emrid-work-item-producer` (stream consumer). Last operator-confirmed
  upload: 2026-07-26 (the practitioner/link/roster-cleanup era bundle). The current
  `producer.zip` (2b crossings) is **NOT confirmed deployed — OVR, deploy-first** (§15).
- **WAF / CloudFront / alarms / SNS / uptime checks**: designed in
  `EDGE_PROTECTION_RUNBOOK.md` + `OPERATOR_HANDOFF.md` §13; **no operator evidence any
  of it is applied — OVR** (register R-2/R-3, pilot blockers).
- IAM: least-privilege compute + Lambda roles per `OPERATOR_HANDOFF.md` §3/§10; no Scan
  anywhere; **no IAM changes required by any pushed-but-undeployed work**.
- Local CLI: profile `emrid-dev` = read-limited `emrid-dev-local` (Query/GetItem only);
  the **`default` profile is a DIFFERENT, WRONG account (`877295316242`) — never use it**.

## SECTION 4 — AUTHENTICATION & AUTHORIZATION

Three identity classes over ONE shared pool (pool membership ≠ authorization):
- **Patient**: verified Cognito session + `ProfileAccess` grant per profile
  (`decideProfileAccess`; mutations via `authorizeProfileMutation` — OWNER/GUARDIAN/ADMIN;
  family management via `authorizeFamilyManagement` — OWNER/ADMIN).
- **Practitioner**: verified session + `PRACTITIONER#<sub>` record (the record id IS the
  login join key) + status APPROVED; per-patient reads additionally require an ACTIVE
  grant, `notFound()` on denial (anti-enumeration).
- **Ops staff**: verified session + **≥1 valid Ops Cognito group**. The **front-door
  security fix** (`ae84b59`, lib/auth/session.ts `isAuthorizedOpsUser` +
  pre-cookie check in `signIn`) closed a critical hole where ANY self-registered pool
  user could enter Ops. Roleless sign-ins get a calm explicit error and never receive a
  cookie.

**Per-action RBAC** (verified in `lib/auth/permissions.ts` at HEAD): pure core —
`Permission` union (10), exhaustive `PERMISSION_ROLES`, `hasPermission` (multi-role
union; empty/unknown roles fail closed), exhaustive `WORK_DOMAIN_PERMISSION`
(IDENTITY→DECIDE_IDENTITY, FULFILMENT→PROCESS_FULFILMENT, READINESS→TRANSITION_READINESS_WORK,
PRACTITIONER→MANAGE_PRACTITIONERS, SUPPORT→RESOLVE_SUPPORT), `ensurePermission` (calm
denial message). **Enforcement is authoritative in the testable orchestrator/service
layer** of every mutating action; work transitions derive their permission from the
item's TYPE metadata, never client-sent domain. Denials emit `emrid-ops:authz-denied`
(ids + permission only) and perform zero writes (pinned). UI gating = server-computed
serializable booleans, convenience only. `/administration` requires
VIEW_ADMINISTRATION (server fail-closed + sidebar hidden). A source-level wiring guard
in `tests/permissions.test.ts` fails the suite if a `"use server"` mutation file ships
outside the enforcement map. Mock user role override for dev/smoke: `MOCK_OPS_ROLES`
env (mock mode only).

**Exact matrix (from code):** every row explicitly includes SUPER_ADMIN; EXECUTIVE holds
nothing (read-only).
- DECIDE_IDENTITY: SUPER_ADMIN, OPERATIONS_ADMIN, IDENTITY_OFFICER
- PROCESS_FULFILMENT: SUPER_ADMIN, OPERATIONS_ADMIN, FULFILMENT_OFFICER
- TRANSITION_READINESS_WORK: SUPER_ADMIN, OPERATIONS_ADMIN, CUSTOMER_SUPPORT
- RESOLVE_SUPPORT: SUPER_ADMIN, OPERATIONS_ADMIN, CUSTOMER_SUPPORT
- MANAGE_PRACTITIONERS: SUPER_ADMIN, OPERATIONS_ADMIN, PRACTITIONER_MANAGER
- ADD_NOTES: SUPER_ADMIN, OPERATIONS_ADMIN, CUSTOMER_SUPPORT, IDENTITY_OFFICER, FULFILMENT_OFFICER, PRACTITIONER_MANAGER
- CORRECT_CONTACT_DETAILS: SUPER_ADMIN, OPERATIONS_ADMIN, CUSTOMER_SUPPORT
- ASSIST_DEVICES: SUPER_ADMIN, OPERATIONS_ADMIN, CUSTOMER_SUPPORT
- REVOKE_DEVICES: SUPER_ADMIN, OPERATIONS_ADMIN
- VIEW_ADMINISTRATION: SUPER_ADMIN, OPERATIONS_ADMIN

## SECTION 5 — CUSTOMER LIFECYCLE

Register (Cognito, public) → profile (`PROFILE` item; `contactEmail` auto-set from the
owning account; optional `contactMobile`) → emergency profile (field-level visibility;
`PUBLIC_EMERGENCY` only ever leaves the server on `/e`) → identity submission (S3 doc +
isolated plaintext `IDENTITY` item + Profile status PENDING) → **producer** creates
`VERIFY_IDENTITY` work → Identity Officer approves in the Workspace
(`executeTransition`: Profile VERIFIED + audit + **app-side identity crossing**) → card
request (Device PENDING + `dvtk_` token + activation code) → producer creates
`ISSUE_CARD` (**device-scoped id `<deviceId>-card`** since `2121eb7`; legacy
`<customerId>-card` items remain valid) → fulfilment: encode → tap-test
(`DEVICE_TAP_TESTED` from `/e` on PENDING) → dispatch → **WAITING (Ops never
activates)** → customer activates with the code → stream: producer completes the card
work (status-based match, terminal = replay marker) + **`applyDeviceCrossing` moves the
aggregate** + directory refresh → **PROTECTED** (identity VERIFIED ∧ any card ACTIVE ∧
emergency present — `protectionStatusFromFacets`, the single source both app and
producer use) → responder taps `/e/<token>` (GSI1 exact-match, ACTIVE only, filtered
view, `EMERGENCY_PROFILE_VIEWED` audit). Readiness (0–100: profile 15 / identity 30 /
emergency 25 / contact 15 / card 15; READY ≥85) is a component of Protection, never a
gate. Aggregate model: maintained counters `{protectedCount, inProgressCount, version}`
moved only on boundary crossings (identity: app-side in `executeTransition`; device:
producer-owned — §14).

## SECTION 6 — WORK ENGINE

`WorkItem` (UI) ↔ `WorkItemRecord` (persisted) mapped 1:1. **Dual projection**:
`WORK#<domain> / STATUS#<s>#PRIORITY#<p>#DUE#<d>#WORK#<id>` (queues) +
`PROFILE#<subjectId> / WORK#<status>#<id>` (workspace); transitions rewrite both in one
TransactWrite (same-SK transitions Put-overwrite — Dynamo rejects delete+put on one
item). **Types (from `lib/work/work-type.ts`)**: VERIFY_IDENTITY(IDENTITY),
ISSUE_CARD(FULFILMENT), COMPLETE_PROFILE / ADD_EMERGENCY_INFO / ADD_EMERGENCY_CONTACT
(READINESS), APPROVE_PRACTITIONER(PRACTITIONER), RESOLVE_SUPPORT_QUERY(SUPPORT).
**Domains**: READINESS, IDENTITY, FULFILMENT, PRACTITIONER, SUPPORT — each an exhaustive
`Record` with queue route. Producer creates work idempotently (deterministic ids +
conditional create): identity `<profileId>-identity`, card `<deviceId>-card` (new) /
`<customerId>-card` (legacy), practitioner `<id>-practitioner`; support queries are
operator-created (`<customerId>-support-<uuid>`, source CUSTOMER_REQUEST).
`planTransition` (pure) maps type+toStatus → persistence plan (IDENTITY_DECISION /
CARD_ACTIVATION / PRACTITIONER_DECISION / AUDIT_ONLY / UNSUPPORTED-fails-closed);
`executeTransition` (injectable, RBAC-enforcing via actor roles) orchestrates
move + shared-state write + audit (+ identity-only aggregate). Queue = one generic
`WorkQueue` over `listByDomain`; bulk primary action runs real per-item transitions;
the old mock "Assign to me" was **removed** (assignment = future Slice E). Replay
safety: conditional creates, terminal/status markers, recompute-from-truth refreshes,
directory-before crossings.

## SECTION 7 — CUSTOMER DIRECTORY

`DIRECTORY / CUSTOMER#<profileId>` + `DIRECTORY / PRACTITIONER#<practitionerId>` —
Ops-owned, producer-maintained recompute-from-truth projections (operational fields
only, never medical values). Refreshed on ANY profile-linked stream change; practitioner
entries on PRACTITIONER changes; REMOVE of a practitioner deletes its entry (re-key
cleanup). Consumers: `/customers` index, `/practitioners` roster, ⌘K palette
(name/emrid/id/protection only), Mission Control widgets. **The directory entry's
`protectionStatus` is also the "before" record for producer crossings (§14).** No
runtime scans anywhere (scans only in operator scripts). Backfill:
`scripts/backfill-directory.mjs` (operator, one-off, drives touch events through the
Lambda) — was executed for the 11 real customers (live-verified 2026-07-03).

## SECTION 8 — CUSTOMER WORKSPACE (current code inventory)

`/customers/[id]` — the ONE customer view. Header: name, Protection + Readiness badges.
Rail: ReadinessCard · Summary (**EMRID, Account status, Email, Mobile, Joined,
Identity, Card**) · Card Fulfilment Pack (**permanent whenever any device exists** —
EMRID, device id, token, NFC URL on the Patient origin, activation code, last tap) ·
DevicesCard (all devices + status; no credentials) · PractitionersCard (grants incl.
revoked history, practice, dates) · FamilyCard (owner/members/roles/dates + pending
invites with expiry state; token-free) · MembershipCard (plan, cycle, locked price,
status, payment ref, renewal, covered-members usage, "never affects emergency access"
line). Actions rail (all RBAC-gated): QuickActions (permission-filtered work) ·
Customer support (log support query) · **Device assistance** (suspend/reactivate/
revoke/replace with verification) · Contact correction. Tabs: Overview (narrative +
ActiveWork) · Active work (+ **Work history** of terminal items) · Notes (persisted
OPSNOTE items; composer RBAC-gated). Timeline: real audit trail (GSI2), curated labels
for ~32 event types, **metadata never rendered** (leak-proof by construction).
Documents: reviewed via presigned GET in the identity flow (no general documents panel).
Practitioner Workspace `/practitioners/[id]`: details, practice, Manage tab (account
form + **Link login account** for `prac_` records), approval panel (admin-created
PENDING only), linked patients, timeline.

## SECTION 9 — FAMILY / ACCESS ALIGNMENT (complete, in `42e3f6d`)

Patient truth: `ProfileAccess` roles OWNER/GUARDIAN/DEPENDENT/VIEWER/ADMIN (only
GUARDIAN/VIEWER invitable; DEPENDENT/ADMIN typed-only), dual-written grants, family
invites (`FAMILY_INVITE#` record + `FINV#<token>` pointer, `fam_`+28 token ~140-bit,
14-day app-side expiry, email-bound acceptance, owner-only management, self-leave),
revocation deletes both projections (existence ⇒ active). Ops: read-only
`FamilyRepository` (bounded partition Queries), **token-free `FamilyInviteSummary`
mirror — the reconstructor DROPS the stored bearer token (pinned by test, like the
raw-ID drop)**, FamilyCard per §8. Invariants: raw invite tokens never enter the Ops
domain model or any serialized UI; Support never grants GUARDIAN authority; OWNER
authority is Patient-controlled; Ops has zero family mutations.

## SECTION 10 — MEMBERSHIP

Patient truth (`lib/billing/packages.ts`): INDIVIDUAL (R45/mo, R360/yr), SPOUSAL
(R80/mo, R900/yr, 2 members), FAMILY (R150/mo, R2000/yr, 4), PILOT (legacy,
non-purchasable). `USER#<userId>/MEMBERSHIP` item; statuses PENDING_PAYMENT/ACTIVE/
PAST_DUE/EXPIRED/CANCELLED; **price server-locked** (client sends only plan+cycle);
`EMR-PAY-*` placeholder references. Ops: read-only MembershipCard resolved via the
profile's OWNER grant → owner's membership (two bounded reads). **Invariant
(code-verified): membership NEVER gates `/e`** — zero membership reads outside
`app/app/membership/*`; stated on the Ops card. **Does NOT exist**: payment gateway,
webhook, redirect URL, entitlement ENFORCEMENT (maxMembers is copy), membership audit
on status change, any Ops membership mutation. Patient-side hazards still open: the
self-service **demo status control** (unaudited) and no `/e`-invariant pin test
(register §18). Marketing pricing page: "Protect your life from R1/day", R45/R360.

## SECTION 11 — PRACTITIONER MODEL (CPTO-confirmed, in persistent memory + docs)

**Practitioners NEVER publicly self-register.** Sales → commercial agreement →
**Administration** provisions internally (onboard form creates Practice + Practitioner
APPROVED; Cognito login via `admin-create-user` + **`admin-set-user-password
--permanent`** — the login flow rejects FORCE_CHANGE_PASSWORD; credentials shared
securely; no Cognito group needed for the portal) → practitioner portal → **Practitioner
Operations** manages/supports thereafter. PENDING is an internal administrative state
only; approval mechanics remain in code but are not the V1 journey. Ops surfaces:
roster (directory-backed + search), onboarding form (optional sub at creation),
workspace Manage tab (audited `PRACTITIONER_UPDATED`), **login linking** (atomic re-key
of a `prac_` record + all grant pairs to the sub; ≤24 grants; refused with open work;
ghost roster entry removed via producer), approval panel (admin-created PENDING only,
decision writes status+notes read back by the portal). Patient-side consent controls:
patient (OWNER) views active grants, revokes with **atomic access-code rotation**
(single transact: revoke both grant projections + delete old `PCODE#` pointer + fresh
code) — practitioner self-revoke does NOT rotate. **PRACTITIONER APPROVAL ≠ PATIENT
CONSENT** — Ops never grants patient access; only patients do (code redemption /
claim). Access codes: `EMR-XXXX-XXXX-XXXX` (~60-bit, plaintext at rest — register §18);
never readable anywhere in Ops.

## SECTION 12 — CUSTOMER SUPPORT / CMS STAGE 1 (complete, `bb9dba0`)

Support: `RESOLVE_SUPPORT_QUERY` work items logged from the Workspace (query text
captured as a note; `OPS_WORK_TRANSITION` audit with trigger SUPPORT_QUERY_LOGGED),
SUPPORT queue projection, persisted internal notes (Ops-owned
`PROFILE#<id>/OPSNOTE#<ts>#<id>`, append-only, attributed), devices/practitioner/family/
membership visibility, work history, timeline, audited resolution. **CMS Stage 1 "Safe
Corrections"**: Support corrects **contactEmail + contactMobile only** — whitelist-built
conditional update (name/DOB/identity/medical unrepresentable AND runtime-ignored,
pinned); mandatory verification method (PHONE_CALLBACK / EMRID_DOB_CHALLENGE /
EMAIL_THREAD / IN_PERSON) + reason; `PROFILE_UPDATED` audit (OPS actor, **field names +
method only — no old/new values, pinned**); generated support note (no PII values); UI
states contact email **does NOT change the Cognito login email** (they are decoupled:
login = Cognito claim, contactEmail = profile display copy set at create/claim).
Summary shows EMRID + account status.

## SECTION 13 — CMS STAGE 2: ASSISTED DEVICE SUPPORT (implemented + pushed in `2121eb7`)

Verified in code at HEAD. Journey: possibly lost → **SUSPEND** · found → **REACTIVATE**
(both ASSIST_DEVICES: CS/OA/SA) · confirmed lost/compromised → **REVOKE** · replacement
→ **REVOKE + fresh PENDING device** (both REVOKE_DEVICES: OA/SA). Every action requires
verification method + reason; audited (`DEVICE_SUSPENDED/REACTIVATED/REVOKED`, OPS
actor, ids+method only; replacement also writes `CARD_REQUESTED` with
`replacesDeviceId`); support note generated; **tokens/activation codes never in
audit/notes (pinned)**. Repo writes: conditional dual-item transitions enforcing the
legal map IN the write (suspend⇐ACTIVE, reactivate⇐SUSPENDED, revoke⇐non-terminal) so
racing patient self-service fails cleanly. Replacement: `issueReplacementDevice` →
PENDING + **canonical `dvtk_`+28-Crockford token** (mirrored generator
`lib/devices/token.ts`, format pinned) + activation code → stream → producer raises
`ISSUE_CARD` → normal fulfilment → patient activates. **No REPLACED-status workflow, no
replacement work type.** Critical fix inside this slice: card work ids are now
**device-scoped** (`<deviceId>-card`) so replacements raise fresh work (the legacy
`<customerId>-card` id collided with completed original work); completion matches by
type+non-terminal status, keeping legacy items valid. Known pre-existing quirk: the
device-creation fallback inside `markCardActive` still uses a bare UUID token — it is
believed unreachable in production (devices always pre-exist) and was deliberately NOT
copied into replacement issuance; cleaning it up is fair game.

## SECTION 14 — DEVICE PROTECTION STATE-SYNC (the current critical change; in `2121eb7`)

**Ownership model (CPTO-mandated, code-verified):** any Patient OR Ops device state
mutation → DynamoDB Stream → producer → protection boundary calculation → aggregate.
- `deviceCrossingCandidate(change)` (producer-core): fires on ANY device status change
  (both directions), returns the customerId.
- `applyDeviceCrossing(deps, customerId)` (producer): **before = the customer's
  directory entry `protectionStatus`** (producer-maintained, refreshed AFTER the
  crossing on the same event) · **after = current truth**
  (`protectionStatusFromFacets` over profile/emergency/devices) · delta via
  `protectedLivesDelta`; adjust only on a crossing. **Replay-idempotent by
  construction** (redelivery finds before==after); **multi-device-safe by truth**
  (another ACTIVE device ⇒ no delta). Missing directory entry ⇒ skip (backfill
  guarantees entries; reconcile-report is the net).
- `completeCardWork` no longer touches the aggregate (work completion + SYSTEM audit
  only). **`executeTransition`'s CARD_ACTIVATION branch no longer adjusts** (device
  write streams to the producer; adjusting app-side would double-count).
  **Identity-driven crossings remain app-side** in `executeTransition` (IDENTITY_DECISION
  only) — per the mandate.
- All five multi-device/replay cases are pinned in `tests/device-assist.test.ts`
  ("producer-owned device crossings (2b)"), using a stateful directory double (the mock
  directory recomputes on read and CANNOT serve as a before-record — test doubles must
  store entries; same applies to `tests/work-producer.test.ts`'s
  `producerDepsWithStatefulDirectory`).
- Consequence: this model also FIXES the pre-existing drift where patient self-suspend
  of the only active card never decremented — but **only once the new Lambda is
  deployed**.

## SECTION 15 — CURRENT DEPLOYMENT STATE (resolve FIRST)

CMS Stage 2a+2b: **IMPLEMENTED ✅ · COMMITTED ✅ (`2121eb7`) · PUSHED ✅ (origin/main
confirmed in-sync, clean tree) · LAMBDA DEPLOYED: OPERATOR VERIFICATION REQUIRED ·
AMPLIFY DEPLOYED: OPERATOR VERIFICATION REQUIRED · LIVE CERTIFIED: NOT CERTIFIED.**
Artifact ready: `producer.zip` 178,189 bytes, SHA-256
`0cc36aeb…c8642` (full hash in the anchors above), committed in `2121eb7`.
**Approved deploy order: 1) Lambda producer update, 2) Ops Amplify deploy, 3) live
certification.** The app's device-assist actions MUST NOT be used before the new Lambda
is live (crossings would go unapplied; Ops writes deliberately no longer adjust the
aggregate). Also unresolved: the Patient repo's uncommitted download-filename fix (see
anchors) predates any Patient deploy of it. Additionally OVR (approved-for-deploy
earlier, no confirmations on record in the prior session): Amplify state of `42e3f6d`/`bb9dba0`/`b30f76c`; Patient Amplify
state past `0a248db`/`163642d` (incl. the two new external commits); dev.emrid.co.za
retirement + card re-encoding completion; WAF/alarms/PITR setup.

## SECTION 16 — OBSERVABILITY & HARDENING

In code (deployed state per §15): structured single-line JSON error records —
`emrid:error` (Patient) / `emrid-ops:error` (Ops) markers to stderr→CloudWatch; wired
into all error boundaries, root `global-error`, every server-action catch/fail-closed
path, and the `/e` audit-write failure; client beacons via size-capped
`/api/client-error` (Ops: behind the cookie gate; Patient: public, WAF-rate-limit
planned); **`emrid-ops:authz-denied`** security signal (separate marker so denials never
pollute failure alarms). `GET /api/health` on both apps (secret-free booleans; the
post-deploy mock-flags verification step; excluded from Ops auth middleware). Security
headers via `amplify.yml` customHeaders on BOTH apps (HSTS, XCTO, XFO DENY,
Referrer-Policy, Permissions-Policy); **CSP deliberately deferred** (R-12). Operational
theatre removed (no mock actions; Mission Control renders only live data — briefing from
the work index, hero from the aggregate; fabricated health/alerts/activity engines
deleted). Dependency posture: 0 vulns with pinned overrides; NOTE — new advisories
appeared twice mid-project; always re-run `npm audit` as a gate. **CloudWatch metric
filters/alarms/SNS, uptime checks, WAF attach (COUNT→BLOCK plan), PITR/S3-versioning:
designed + runbook'd, zero operator confirmation — OVR** (`OPERATOR_HANDOFF.md`
§13–§15, `EDGE_PROTECTION_RUNBOOK.md`).

## SECTION 17 — OPERATIONAL CERTIFICATIONS (session-evidence based)

- Patient lifecycle (register→protected): **CERTIFIED** (First Production Protected Life).
- First Protected Life: **CERTIFIED** (John Doe; live-table evidence). Protected Life #2
  (Michael Edwards …be8eee75) also live-verified via aggregate `{2,1,v3}` + directory.
- Emergency response `/e`: **CERTIFIED on the original domain** (real responder taps in
  audit); **PARTIAL post-domain-move** — www re-certification + card re-encode OVR.
- Ops security boundary (front-door fix live behaviour): **PARTIAL** — code+tests
  certain; the live "roleless login rejected" check was specified but never confirmed
  to engineering. CPTO proceeded as if complete → confirm.
- Practitioner lifecycle: **PARTIAL** — code-certified end-to-end incl. login-linking;
  the live Dr Michael Edwards onboarding was paused (awaiting practitioner/practice
  emails) and never completed in-session; CPTO later implied completion → confirm.
- Customer Support & CMS Stage 1: **PARTIAL** — fully code-certified with mandated test
  matrices; live checklists issued; no live confirmations on record.
- Per-action RBAC: **PARTIAL** — code-certified; CPTO stated live role certification
  would follow deployment; the CMS-2 prompt referenced "newly-certified" permissions →
  treat as operator-asserted, unverified by engineering.
- CMS Stage 2a+2b: **NOT CERTIFIED** (not yet deployed).

## SECTION 18 — SECURITY / PRIVACY / POPIA (see `RISK_REGISTER.md` — still current)

Open: plaintext SA ID numbers in the isolated IDENTITY item (R-4 — **hard gate before
real-identity scale/GA**); plaintext practitioner access codes at rest, ~60-bit,
reveal not audited; no right-to-erasure (soft-delete only, R-6); retention policy
undocumented; Patient contact form silently discards messages (data-loss/trust — HIGH,
Patient-side, unfixed); Patient post-VERIFIED name/DOB editing with no re-verification
trigger (identity integrity, Patient-side); membership demo status control (unaudited
self-service mutation — must be removed before billing is real); family invite tokens
embedded in the owner's page HTML at load (Patient-side, owner-scoped, LOW);
`memberEmail`/`paymentRef` visible to all staff roles (visibility RBAC deferred);
Cognito admin operations (login-email change, unlock, disable) remain **AWS-console
only** by design (credential-free apps; future Ops-Admin seam is an infrastructure
decision); no `/e` membership-invariant pin test (Patient-side, recommended); no TTL
cleanup for expired invites/claims; refresh-token rotation absent (~1h re-login, R-13);
Cognito has no backup (R-18); production data in dev-named table (R-14). Pilot
blockers R-1/R-2/R-3: R-1's code half is done — live check pending; R-2 (WAF)/R-3
(alarms) are operator work.

## SECTION 19 — ARCHITECTURE FREEZE

Foundational — extend, never casually replace (CPTO approval required to alter):
repository/factory/`pickMigrated` + injectable `DynamoDeps`; Work Engine + dual
projections + deterministic idempotent ids; queue-as-projection (one generic Queue);
ONE Customer Workspace (+ sanctioned Practitioner Workspace on the same framework);
producer (intents, state-sync, directory refresh, **device-crossing ownership**);
Directory projection idiom (no new GSI without escalation, no runtime scans);
Protected Lives aggregate + crossing model (§14); append-only audit + typed metadata
builders (ids only); centralized RBAC core (no scattered role checks — the wiring
guard enforces this); Patient-as-source-of-truth with token-stripping mirror
reconstructors; pure-core + thin-wrapper + injectable-orchestrator testing idiom;
exhaustive `Record` maps for every enum; five gates every slice; pause before deploy.

## SECTION 20 — DELIBERATELY DEFERRED (verified still-open)

REPLACED-status lineage semantics · Cognito admin seam (login-email change/unlock/
disable from Ops) · billing/payment gateway + webhook + real subscription management +
membership corrections (Stage 3, after demo-control removal) · right-to-erasure &
retention tooling · visibility-tier RBAC beyond Administration · Help Centre → support
work-item integration (seam documented: Patient support-submission item + one
`workIntentForChange` mapping; nothing to receive yet — Patient contact form has no
backend) · AI support/chatbot/FAQ (no-AI rule) · marketing CRM · granular practitioner
consent scopes + consent expiry · guardian legal verification · automated customer
notifications on assisted actions · bulk device operations · physical logistics/
tracking · queue assignment ("Slice E": real "Assign to me" + membership facet) ·
practice reuse/dedup in onboarding · identity explicit reject UI (code path exists) ·
Protected Lives weekly delta/trend · Mission Control engine upgrades · shared contract
package + CI drift check (R-11) · `__Host-` cookies + CSP + refresh rotation ·
producer-batch DLQ review cadence · directory enrichment (family/membership fields in
roster). Data housekeeping still open: Robyn's duplicate PENDING device
(`device_4e8d5bde…`, Patient-side cleanup); Cameron Edwards + Michael `…103b2da7`
census decisions; test profiles (Live Test, Lerato Verify, Jeff Epstein, John Smtih,
Bob Wagger) excluded by operator decision, not deleted.

## SECTION 21 — TEST / QUALITY STATE

Ops: **311 tests / 31 files**, typecheck+lint+build clean, audit 0 (overrides pinned).
Patient: **361 tests / 43 files**, same gates clean (the +150 over the prior session's
last count came with the two external commits — their content is unreviewed).
Load-bearing safety pins (Ops): shared-contract key strings + item round-trips +
exhaustive enum value sets + `OPS_AUDIT_EVENT` map · raw-ID reconstructor drop · family
invite token drop (×2) · PROFILE-partition prefix separation (incl.
`PRACTITIONER_CODE` exclusion) · RBAC matrix `toEqual` pin + SUPER_ADMIN-everywhere +
EXECUTIVE-nothing + wiring guard over `"use server"` files · zero-write denial tests
per action family · contact-correction whitelist smuggling test + no-PII-in-audit pins
· device token/code absence in audit+notes · dvtk_ format pin · device crossing
multi-device/replay matrix · no-scan assertions on every Dynamo adapter test.
Known gaps: zero component/RSC render tests; middleware and thin server-action wrappers
untested (logic lives in tested orchestrators by design); mock-mode cannot exercise
directory-before crossing semantics (stateful doubles required — documented in tests);
Patient repo's new test files unreviewed.

## SECTION 22 — OPERATOR RUNBOOK (established model)

Engineering: code → five gates (`npm run typecheck && npm run lint && npm run test &&
npm run build && npm audit`, both repos where touched; Node via
`export PATH="$HOME/.local/node/bin:$PATH"`) → package → pre-deployment report → PAUSE →
on approval commit+push (house style) → stop. Michael: Lambda (when producer changed) →
Amplify → `/api/health` verification (all `mock.*` false; Ops `cognitoConfigured:true`)
→ live certification checklist → Go/No-Go. **Lambda recipe (verbatim from
`PROJECT_HANDOVER.md` §7, still current):**
```bash
cd emrid-ops
npx esbuild lambda/work-item-producer.ts --bundle --platform=node --target=node20 \
  --format=cjs --tsconfig=tsconfig.json "--external:@aws-sdk/*" \
  "--alias:server-only=./lambda/server-only-stub.js" \
  --outfile=dist/lambda/producer/index.js
node -e "require('./dist/lambda/producer/index.js'); console.log('ok')"
( cd dist/lambda/producer && rm -f ../../../producer.zip && zip -qr ../../../producer.zip index.js )
aws lambda update-function-code --function-name emrid-work-item-producer \
  --zip-file fileb://producer.zip --region eu-west-1   # operator, admin creds/CloudShell
```
Deploy order when both change: **Lambda first, then Amplify.** Rollback: redeploy the
previous Amplify build (apps stateless); re-upload the previous producer.zip; the table
is never migrated by Ops deploys. GitHub: `connectbetcoza/{emrid,emrid-ops}`; the local
push credential has expired once before — `gh auth login` fixes it.

## SECTION 23 — IMMEDIATE NEXT ACTION

**D-with-a-precondition — verify-then-certify CMS Stage 2a+2b.** Everything is pushed;
nothing further can be built responsibly until deployment state is resolved. Concretely,
the next session must, in order: (1) ask Michael to confirm/execute the **Lambda
producer update** with the packaged artifact (SHA-256 `0cc36aeb…c8642`, 178,189 bytes —
verify the hash before upload), then (2) confirm/execute the **Ops Amplify deploy** of
`2121eb7` (check `/api/health`), then (3) run the **live CMS Stage 2 certification**
checklist from the approved pre-deployment report: suspend-last-active → aggregate −1
once; `/e` shows suspended; reactivate → +1 once; REPLACE → auto `ISSUE_CARD` in the
Fulfilment queue + canonical `dvtk_` pack; CUSTOMER_SUPPORT denied revoke (UI + server
+ `authz-denied` log); no credentials in audit metadata. Fold in the outstanding
PARTIAL certifications (§17) opportunistically. Only after certification: next
engineering candidates are the un-audited Patient commits' alignment review
(`bc47d0a`, `75db11b`) and the pilot-blocker operator items (WAF, alarms).

---
*End of context package. The next session should read this file first, then
`RISK_REGISTER.md`, then `OPERATOR_HANDOFF.md` §12–§15, and verify both repo HEADs
before acting.*
