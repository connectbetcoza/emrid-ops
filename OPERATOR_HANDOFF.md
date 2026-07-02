# EMRID Operations — Operator Handoff (Backend Phase 1)

> EMRID Operations reuses the Patient Platform's **shared** AWS infrastructure. Application code is written and verified against the mock adapters + the five gates; **live AWS provisioning, IAM, env wiring, and verification are operator-owned** (the engineering contract forbids this codebase from creating infra). This document lists exactly what the operator must do to turn the Phase 1 seams on.

## Principle
Mock-default + fail-closed. With no env set, local dev runs entirely on mocks; a deployed build (`NODE_ENV=production`) fails closed to **real** adapters and will error loudly if AWS config is missing — it never silently runs mock in production.

## 1. Shared resources (already exist for the Patient Platform — reuse, do not recreate)
- **DynamoDB** single table `emrid-dev-app` (+ GSI1, **GSI2**). Ops reads/writes the SAME table.
- **Cognito** User Pool + a **public app client** (no secret) with `ALLOW_USER_PASSWORD_AUTH`. Ops staff sign in here.
- **S3** private document bucket (Block Public Access on, SSE). Ops issues presigned **GET**s to review ID documents.

## 2. Cognito — Ops staff
- Create an **Ops staff group set** in the existing pool: Cognito **groups named exactly** as the `OpsRole` values — `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `CUSTOMER_SUPPORT`, `IDENTITY_OFFICER`, `FULFILMENT_OFFICER`, `PRACTITIONER_MANAGER`, `EXECUTIVE`. Group membership → roles (`cognito:groups` claim → `OpsRole[]`).
- Use the **same public app client pattern** as the Patient Platform (no secret; `USER_PASSWORD_AUTH`). Decide: same app client or a dedicated Ops client on the same pool.
- The ID token must include `email`, optionally `name`, and `cognito:groups`.

### 2a. ✅ Ops sign-in route — IMPLEMENTED (`/login`)
The staff sign-in entry point now exists (`app/login/`) and is wired to the credential-free Cognito seam — no AWS keys, no client secret, no admin APIs.
- **Flow:** `/login` → `signIn` server action → `initiateAuth` (`USER_PASSWORD_AUTH`, public client) → tokens written to httpOnly cookies (`emrid_ops_id_token`, `emrid_ops_refresh_token`; `Secure` in production) → redirect to the validated `next` path or `/mission-control`. **Sign-out** (header account menu) revokes the refresh token and clears the cookies. The middleware already excludes `/login` from gating and redirects unauthenticated requests there with a `?next=` deep-link.
- **Operator prerequisites to make it function live:** (1) `ALLOW_USER_PASSWORD_AUTH` enabled on the app client; (2) the `NEXT_PUBLIC_COGNITO_*` env vars set **before build** (see §4 — they are inlined); (3) `USE_MOCK_AUTH=false` in the deployed environment; (4) at least one Ops staff user in a correctly-named group (§2). With `USE_MOCK_AUTH=true` (local dev) `/login` forwards straight to Mission Control as the demo user and the sign-out control is an honest disabled "Mock" affordance — no Cognito call is made.
- **Not yet built (later slice):** sign-up / forgot-password UI (the Cognito calls exist in `lib/auth/cognito.ts` but are unused), refresh-token rotation (so the ~1h ID-token expiry still forces re-login), and `__Host-` cookies + tightened CSP.

## 3. IAM (least-privilege, compute role for the Ops app)
Grant the Ops Amplify compute role:
- **DynamoDB:** `GetItem`, `Query`, `UpdateItem`, `PutItem`, `DeleteItem`, and `TransactWriteItems` on the table, plus `Query` on the **`GSI1`** (device token → device) and **`GSI2`** (audit timeline) index ARNs. Usage: `UpdateItem` on `PROFILE#…/PROFILE` (identity decision); `PutItem` for `AUDIT#…`; **`TransactWriteItems` for the Work Item dual-write + transitions, and for the Device dual-write (canonical `DEVICE#…` + per-profile `PROFILE#…/DEVICE#…`) on issue/activate**; `Query` on `WORK#<domain>` (queues), `PROFILE#<customerId>` (active work + documents + devices), `GSI1` (public tap by token), and `GSI2`; `GetItem` for profile/identity/document.
- **S3:** `s3:GetObject` on the document bucket prefix (`profiles/*`) — download only.
- **No AWS keys in env** — use the compute role via the default provider chain.
- **No `Scan` permission is needed** — the design never scans.

## 4. Environment variables (Amplify console → written to `.env.production` by `amplify.yml`)
| Var | Purpose |
|---|---|
| `APP_ENV=production` | marks production |
| `USE_MOCK_AUTH=false` | real Cognito |
| `USE_MOCK_DATA=false` | real DynamoDB |
| `USE_MOCK_UPLOADS=false` | real S3 |
| `APP_AWS_REGION=eu-west-1` | region (NOT `AWS_*` — Amplify rejects that prefix) |
| `DYNAMODB_TABLE_NAME` | the shared table name |
| `S3_DOCUMENT_BUCKET` | the shared bucket name |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | set **before build** (inlined) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | set **before build** (inlined) |
| `NEXT_PUBLIC_COGNITO_REGION` | set **before build** (inlined) |
| `NEXT_PUBLIC_APP_URL` | the Ops origin |
| `NEXT_PUBLIC_PATIENT_APP_URL` | the **Patient Platform** origin — base for the `/e/<token>` NFC URL in the card fulfilment pack (set **before build**; falls back to `NEXT_PUBLIC_APP_URL`, which is only correct in single-origin dev) |

`next.config.mjs` already allow-lists `ops.emrid.co.za` + `*.amplifyapp.com` for Server Actions.

## 5. ✅ Access pattern — RESOLVED: Ops Work Index (no GSI, no scan)
Decision taken: Identity Verification (and every queue) is a projection over **persisted Work Items**, not a query over profile status. No GSI on `identityVerificationStatus`. Each Work Item is **dual-written** into the shared table:
- **Queue projection** — `PK = WORK#<domain>`, `SK = STATUS#<status>#PRIORITY#<priority>#DUE#<dueAt>#WORK#<id>` (queue reads by domain).
- **Customer index** — `PK = PROFILE#<customerId>`, `SK = WORK#<status>#<id>` (Workspace Active Work reads by customer).

Both items carry the full record and encode `status` in the SK, so a transition rewrites both via one `TransactWriteItems` (delete old pair + put new pair). `DynamoProfileRepository.listByIdentityStatus` is now unused by the queue and remains fail-closed.

**Operator action:** a Work Item must exist for each identity submission. ✅ **The producer logic is now implemented** (see §10); the operator wires the DynamoDB Stream → Lambda that invokes it. Until that Lambda is deployed, the Ops work index is seeded from mock.

## 6. ⚠️ Shared-contract drift (highest structural risk)
Two repos write one table with **no shared package** for the key design. `lib/data/aws/keys.ts` + `lib/data/entities.ts` here are a **frozen mirror** of the Patient Platform's `lib/data/aws/keys.ts` + `types/*`. `tests/shared-contract.test.ts` guards the key strings, but cannot detect drift in the *Patient Platform*. **Recommended:** extract the key design + shared entity types into a shared package (or a generated contract) consumed by both apps, with a CI check.

### 6a. ✅ Enum-value reconciliation — DONE (2026-06-30)
The entity enum **values** were reconciled against the Patient Platform's `types/*` and `tests/shared-contract.test.ts` now pins each value set (exhaustive `Record<Union, true>` → drift fails typecheck *and* a runtime assertion). Reconciled: `IdentityVerificationStatus` (`NONE`→**`UNVERIFIED`** — was a live-data bug), `ProfileStatus`, `VerificationLevel`, `IdType` (`SA_ID`→`SOUTH_AFRICAN_ID`), `DocumentStatus` (`UPLOADED`→`STORED`), `DocumentCategory`, `AuditTargetType`; mock seeds emitting non-Patient values were fixed. `DeviceStatus`, `EmergencyProfile`, and all key strings already matched.

### 6b. ✅ Audit vocabulary — DECISION TAKEN: Option A (Ops side DONE; Patient side REQUIRED before live)
**Decision:** extend the shared audit vocabulary so Ops actions are first-class facts — **not** mapped onto approximate Patient events.

**Ops side (done):** `AuditActorType` = Patient set **+ `OPS`** (`lib/data/entities.ts`); the Ops-authored event types are a single source in `lib/work/audit.ts` (`OPS_AUDIT_EVENT`) used by `lib/work/transition-service.ts`; both are pinned in `tests/shared-contract.test.ts`.

**Patient Platform side — REQUIRED coordinated change (do this, then deploy both together; do NOT connect AWS until done):**
1. **`types/audit.ts` → `AuditActorType`:** add `"OPS"`.
2. **`types/audit.ts` → `AuditEventType`:** add `"IDENTITY_VERIFIED"`, `"IDENTITY_REJECTED"`, `"CARD_ACTIVATED"`, `"OPS_WORK_TRANSITION"`.
3. **Timeline / label renderers:** ensure any code that switches on `AuditActorType` / `AuditEventType` (patient activity timeline, label maps, exhaustive switches) handles these new values safely (a label + a sensible default) so an Ops event never renders as "unknown" or throws.
4. Re-run the Patient Platform's own test suite; ship both repos together.

Why Option A: the Ops events (`IDENTITY_VERIFIED`, `CARD_ACTIVATED`) are materially distinct operational facts in a healthcare **audit trail** — disguising them as generic Patient events (Option B) would be lossy and misleading. There is no honest existing Patient event for "identity verified by Ops".

## 7. Pilot data protection
The raw ID number lives in the isolated `PROFILE#…/IDENTITY` item (plaintext; relies on DynamoDB KMS-at-rest + TLS). Ops reads it only server-side, never logs/serialises it. Encrypt/tokenise before scaling (shared debt with the Patient Platform).

## 8. ✅ Emergency profile — Ops read path IMPLEMENTED (`PROFILE#<id>/EMERGENCY`)
Readiness is now **fully repository-backed**. The Ops side reads the shared `EmergencyProfile` item to derive the *emergency-info* and *emergency-contact* readiness factors, and derives *profile-completeness* from the `Profile` item — the last three facets that were previously fixture input.
- **Access pattern:** a single base-table `GetItem` on `PK = PROFILE#<id>`, `SK = EMERGENCY`. **No scan, no GSI.** Ops is **read-only** on emergency data — the Patient Platform owns the write (the customer fills in their emergency profile); Ops reads what they write, which is exactly how journey step 11 ("emergency present ⇒ PROTECTED") becomes live.
- **Contract reconciliation (done 2026-06-30):** `EmergencyProfile` (+ `Visibility`, `VisibleField`, `EmergencyContact`, `MedicalAidInfo`, `DoctorContact`) in `lib/data/entities.ts` and `EMERGENCY_SK`/`emergencyItem`/`itemToEmergencyProfile` in `lib/data/aws/keys.ts` are mirrored **byte-for-byte** from the Patient Platform's `types/emergency.ts` + `lib/data/aws/keys.ts`. `tests/shared-contract.test.ts` now pins `EMERGENCY_SK = "EMERGENCY"` and the item round-trip. **Before flipping `USE_MOCK_DATA=false`, re-confirm this shape against the Patient Platform** (same mirror-drift caveat as §6) — visibility filtering for any public surface must stay in application code, never in the query.
- **IAM:** already covered by the existing `dynamodb:GetItem` on the table (no new permission). **No new GSI.**
- **Operator action:** none beyond the existing DynamoDB grant; the read activates automatically when `USE_MOCK_DATA=false`.

## 9. ✅ Protected-Lives aggregate IMPLEMENTED (`AGGREGATE#PROTECTED_LIVES / CURRENT`)
The Mission Control north-star figure is now repository-backed by a **maintained aggregate** — no profile scan, no status GSI, no list-all method.
- **Item (Ops-owned, NOT mirrored):** a single row `PK = AGGREGATE#PROTECTED_LIVES`, `SK = CURRENT`, holding `protectedCount`, `inProgressCount`, `lastUpdatedAt`, `version`. The Patient Platform never reads or writes it, so it carries no cross-product drift risk.
- **Maintenance:** `executeTransition` adjusts the counters **only when a customer crosses the PROTECTED boundary** (identity-decision or card-activation that flips protection). The write is an atomic DynamoDB `ADD` (no read-modify-write race). Non-crossing transitions never touch the aggregate.
- **IAM:** needs `dynamodb:UpdateItem` on the table (already granted in §3) plus the existing `GetItem`. **No new GSI, no new resource** — just a new item key namespace on the shared table.
- **⚠️ Operator action — backfill + reconciliation (REQUIRED before the figure is trustworthy in production):**
  1. **Backfill** the initial `protectedCount`/`inProgressCount` once (a one-off administrative count or migration), since the aggregate starts at zero on a fresh table and is only moved by Ops-observed crossings thereafter.
  2. **Reconciliation:** a customer can cross the boundary via a *Patient-Platform* event Ops does not observe (e.g. the customer adds the final emergency field after their card is already active). The durable fix is the **same Stream→Lambda producer** planned for Work Items (§5) also recomputing/adjusting the aggregate on relevant shared-table events; until then, schedule a periodic reconciliation job. This limitation is by design for the "maintained-on-Ops-transition" scope of this slice.
- **Not yet tracked:** weekly delta / trend direction (no historical snapshots) — the hero reports a neutral/no-trend state honestly rather than a fabricated figure; a future slice can add a weekly snapshot without touching the hero.

## 10. ✅ Work Item producer IMPLEMENTED (Stream → Lambda)
The application logic that turns a Patient-Platform shared-table write into the correct Work Item is built and tested (no mock seeding required in production). The operator deploys the trigger; the logic lives in this repo.

**What it does (the two safely-derivable signals):**
- A **Profile** item reaching `identityVerificationStatus = PENDING` (a fresh identity submission) → creates a `VERIFY_IDENTITY` Work Item (domain IDENTITY).
- A **Device** item reaching `status = PENDING` (a card requested) → creates an `ISSUE_CARD` Work Item (domain FULFILMENT).
- Reuses the existing WorkType / WorkDomain / priority rules and the Work Item dual-write key design — **no new work concepts**.

**Idempotency (replay-safe):** the `workItemId` is **deterministic** (`<customerId>-identity` / `<customerId>-card`, matching the readiness generator), and `WorkItemRepository.create` is **idempotent** — a pre-existence check skips a replay, and the DynamoDB `create` uses conditional `attribute_not_exists(PK)` Puts as the atomic backstop. **Replaying the same stream event never creates a duplicate or clobbers progress.**

**Code seams:**
- `lib/work/producer-core.ts` — pure: `workIntentForChange`, `buildProducedWorkItem` (deterministic id, reused meta/rules).
- `lib/work/stream.ts` — pure: dependency-free unmarshall + `parseStreamRecord`.
- `lib/work/producer.ts` — `produceFromChange` / `produceFromStreamRecords(deps, records, now)` over injected repositories (mock or DynamoDB via the factory).

**Operator deployment (DynamoDB Stream → Lambda):**
1. Enable a **DynamoDB Stream** on the shared table with `StreamViewType = NEW_AND_OLD_IMAGES` (old image is used to fire only on the transition *into* the triggering status).
2. Deploy a small **Lambda** (Node) whose handler imports `produceFromStreamRecords` and passes `event.Records` plus the **flag-selected real repositories** (`getWorkItemRepository()`, `getProfileRepository()` with `USE_MOCK_DATA=false`) and `now = new Date().toISOString()`.
3. Wire an **event-source mapping** from the stream to the Lambda. A stream filter on the relevant keys (`SK = PROFILE` / `SK = DEVICE`) is an optional cost optimisation; the producer already no-ops on irrelevant records.
4. **IAM (Lambda execution role):** `dynamodb:GetRecords`/`GetShardIterator`/`DescribeStream`/`ListStreams` on the table stream ARN; plus the Ops table permissions the producer needs — `Query` (the customer-index idempotency read) and `TransactWriteItems` (the dual-write create). **No `Scan`.**
5. Failure handling: configure a DLQ / bisect-on-error on the event-source mapping; the handler skips malformed records rather than failing the batch.

**State-sync (activation completion) — added after the First Protected Life:**
- The producer now ALSO observes the CUSTOMER's real card activation (a Device item reaching `ACTIVE` from a non-ACTIVE state) and **completes the customer's `ISSUE_CARD` Work Item** (→ DONE, both projections), **applies the Protected-boundary crossing to the aggregate exactly once**, and appends a SYSTEM `OPS_WORK_TRANSITION` audit (metadata `trigger: CARD_ACTIVATED`). Ops dispatch still never activates — activation remains patient-owned.
- **Replay-safe:** the work item's terminal status is the dedupe marker — a redelivered activation event finds it DONE and no-ops (no duplicate completion, no re-increment).
- **⚠️ Lambda redeploy + IAM additions required:** rebuild/redeploy the Lambda bundle (the handler now injects the device/emergency/aggregate/audit repositories), and add to the producer Lambda role, on the table ARN: **`dynamodb:UpdateItem`** (the aggregate's atomic ADD) and **`dynamodb:DeleteItem`** (the work-item transition's delete+put when status changes). `GetItem`/`Query`/`PutItem` were already granted.

**Relationship to the Protected-Lives aggregate (§9):**
- **Work Items are created by this producer** (on Patient-Platform submissions) and **completed by it on real activation** (above).
- **`executeTransition`** adjusts the aggregate only when an *Ops* action crosses the PROTECTED boundary (e.g. identity approval for a customer whose card is already active); the **producer** owns the activation crossing. The two triggers are disjoint states, so a crossing is never double-counted.
- **Any periodic reconciliation job** (drift from crossings neither observes, e.g. emergency-info added last) remains **operator-owned**.

## 11. ✅ Customer Directory projection IMPLEMENTED (`DIRECTORY / CUSTOMER#<profileId>`)
Operations lists real customers from a **producer-maintained directory projection** (Ops-owned item; single-partition Query — no scan, no GSI, no fixture). The producer refreshes a customer's entry on ANY profile-linked stream change (profile / emergency / device / work / audit), recomputing from source-of-truth reads (replay-safe by construction; DIRECTORY items are ignored by the producer to prevent self-loops). Entries carry operational fields only — never medical content.
- **IAM:** covered by the existing producer grants (`GetItem`/`Query`/`PutItem`) — no new permissions, no new GSI.
- **Operator actions:** (1) rebuild + redeploy the producer Lambda (bundle now includes the directory refresh); (2) one-off backfill for pre-existing profiles: `AWS_PROFILE=<admin> node scripts/backfill-directory.mjs` (scans profiles once — operator tooling only — and drives each through the production Lambda path with a status-unchanged "touch" event; `--dry-run` supported); (3) verify with a Query on `PK=DIRECTORY`.

## 12. ✅ Practitioner Operations IMPLEMENTED (V1: internal creation — no public sign-up)
**V1 policy: practitioners do NOT self-register.** Accounts are created internally by the EMRID team (direct writes / a future admin flow — `createPractitioner` has no public call site on the Patient Platform) and credentials are shared manually. Operations provides read/support/manage: the practitioner **roster** (`/practitioners`, from the `DIRECTORY / PRACTITIONER#<id>` projection), the **Practitioner Workspace** (`/practitioners/[id]`: details, practice, status, linked-patient grants — read-only, patients own granting — and the audit trail), and **global search**. Review support exists for ADMIN-CREATED pending records only: an internally-written PRACTITIONER item at `PENDING` produces `APPROVE_PRACTITIONER` work via the Stream producer, and the workspace's review panel records Approve/Reject + notes (`status` + `statusNotes`, read back by the practitioner portal; `PRACTITIONER_APPROVED`/`PRACTITIONER_REJECTED` audited against the USER identity). It is decision support for internal onboarding, **not** a public application journey.
- **⚠️ Cross-product contract extension (ship BOTH repos together):** `PractitionerStatus` gained `REJECTED` and `Practitioner` gained `statusNotes` (jointly added on the Patient side, whose pending page now renders the rejected state + reason). Audit vocabulary gained `PRACTITIONER_APPROVED`/`PRACTITIONER_REJECTED` on both sides.
- **IAM:** covered by existing grants — the decision is `UpdateItem` on `PRACTITIONER#<id>` (app compute role already has `UpdateItem` on the table); the Lambda's directory upsert is the already-granted `PutItem`. No new GSI, no scans (all reads are point-gets / partition queries).
- **Operator actions:** (1) rebuild + redeploy the producer Lambda (bundle now includes practitioner intent + directory refresh); (2) deploy Patient + Ops together; (3) if any practitioner registered before the producer was live, backfill their work item + directory entry with a synthetic PRACTITIONER PENDING touch event through the Lambda (same §10/§11 recipe).
