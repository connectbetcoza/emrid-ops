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

## 12. ✅ Practitioner Management v1 IMPLEMENTED (internal onboarding + account management; no public sign-up; ACTIVE is the normal state)
**V1 policy: practitioners do NOT self-register.** Accounts are created internally by the EMRID team (direct writes / a future admin flow — `createPractitioner` has no public call site on the Patient Platform) and credentials are shared manually. Operations provides read/support/manage: the practitioner **roster** (`/practitioners`, from the `DIRECTORY / PRACTITIONER#<id>` projection), the **Practitioner Workspace** (`/practitioners/[id]`: details, practice, status, linked-patient grants — read-only, patients own granting — and the audit trail), and **global search**. Review support exists for ADMIN-CREATED pending records only: an internally-written PRACTITIONER item at `PENDING` produces `APPROVE_PRACTITIONER` work via the Stream producer, and the workspace's review panel records Approve/Reject + notes (`status` + `statusNotes`, read back by the practitioner portal; `PRACTITIONER_APPROVED`/`PRACTITIONER_REJECTED` audited against the USER identity). It is account-management support, **not** a public application journey. Status display uses management language over the unchanged shared values (APPROVED shows as “Active”).

**Management v1 additions:** `/practitioners` is the management area — **Onboard practitioner** button (internal form: creates the Practice + Practitioner records, ACTIVE by default; optional Cognito user-id link, else the account shows “credentials/manual account setup pending”), search bar over the roster, and per-practitioner **Manage** tab (name, email, registration number, status, practice name/phone/address — every save audited as `PRACTITIONER_UPDATED`; onboarding audited as `PRACTITIONER_ONBOARDED`; both added to the Patient audit union too). Writes are conditional (`attribute_not_exists` creates / `attribute_exists` updates — no phantoms, idempotent on id). The stream producer refreshes directory entries from these writes automatically. `scripts/backfill-directory.mjs` now also backfills practitioner directory entries (scans `SK=PRACTITIONER`, drives touch events through the Lambda).
- **⚠️ Cross-product contract extension (ship BOTH repos together):** `PractitionerStatus` gained `REJECTED` and `Practitioner` gained `statusNotes` (jointly added on the Patient side, whose pending page now renders the rejected state + reason). Audit vocabulary gained `PRACTITIONER_APPROVED`/`PRACTITIONER_REJECTED` on both sides.
- **IAM:** covered by existing grants — the decision is `UpdateItem` on `PRACTITIONER#<id>` (app compute role already has `UpdateItem` on the table); the Lambda's directory upsert is the already-granted `PutItem`. No new GSI, no scans (all reads are point-gets / partition queries).
- **Operator actions:** (1) rebuild + redeploy the producer Lambda (bundle now includes practitioner intent + directory refresh); (2) deploy Patient + Ops together; (3) if any practitioner registered before the producer was live, backfill their work item + directory entry with a synthetic PRACTITIONER PENDING touch event through the Lambda (same §10/§11 recipe).

**Credential provisioning (V1, Administration-owned — practitioners NEVER self-register; see the Practitioner Operating Model below):** the practitioner record id must equal the Cognito sub for portal login to resolve.
1. Administration creates the login: `aws cognito-idp admin-create-user` leaves the account in `FORCE_CHANGE_PASSWORD`, and the login flow does NOT support the new-password challenge (it fails with "requires an additional step that isn't supported yet") — you MUST finish with `aws cognito-idp admin-set-user-password --permanent` before the practitioner can sign in. Credentials are then shared securely with the practitioner.
2. Link the login to the record: paste the user's `sub` into the onboarding form's Cognito field at creation time, or — if the record already exists unlinked (`prac_…` id) — use **Manage → Link login account** in the Practitioner Workspace (re-keys the record + any grants atomically; audited `PRACTITIONER_UPDATED` with `linkedFrom`).
3. No Cognito group is needed for the practitioner portal — portal access is resolved purely by the practitioner record at `PRACTITIONER#<sub>`. Groups remain an Ops-staff concept.

**Practitioner Operating Model (authoritative, CPTO-confirmed 2026-07-03):** Sales → commercial agreement → **Administration** creates the practitioner account + practice internally, provisions Cognito credentials manually, shares them securely → practitioner logs into the portal and manages patients → **Practitioner Operations** supports the account thereafter. There is NO public practitioner onboarding, application, or approval journey; `PENDING` is an internal administrative state only and **ACTIVE is the normal lifecycle state**. Approval mechanics remain in code for future workflows but are not the V1 journey. Every practitioner feature must first answer: *would EMRID staff perform this, or would a practitioner perform this?* Administration creates; Practitioner Operations manages. Do not regress to a public registration model unless explicitly instructed by the CPTO.

## 13. Observability (GH-1) — operator setup

Engineering ships a structured error seam: every error boundary, server-action catch, and the `/e` audit-failure path emits ONE single-line JSON record to stderr with a stable marker — `emrid-ops:error` (Ops) / `emrid:error` (Patient). Client-side errors beacon to `/api/client-error` (Ops: behind the cookie gate; Patient: public, size-capped, WAF-rate-limited per the edge runbook) and re-emit through the same seam. Records carry scope/digest/ids only — never PII. Amplify SSR compute logs land in CloudWatch automatically.

**Operator steps (one-off, per app):**
1. Find the Amplify compute log group (Amplify console → App → Hosting → Monitoring → Logs), e.g. `/aws/amplify/<appId>`.
2. Metric filter: pattern `"emrid-ops:error"` (resp. `"emrid:error"`) → metric `EmridOps/Errors` (resp. `Emrid/Errors`), value 1.
3. Alarm: `>= 5 errors in 5 min` → SNS topic → email/phone. Also add a `>= 1` alarm for `scope:"route:/e:audit-write"` (audit pipeline failure on the life-safety route).
4. Uptime: an external or Route53 health check on `GET /api/health` for BOTH apps (expect 200 + `"ok":true`; also asserts `mock.*=false` after each deploy — this is now the deploy-verification step).
5. Test-fire: temporarily lower an alarm threshold, hit a bad route, confirm the notification arrives, restore.

## 14. Backup & recovery assumptions (GH-6) — VERIFY, do not assume

Engineering cannot see live AWS state; the following are ASSUMPTIONS the operator must confirm before pilot:

- [ ] **DynamoDB PITR** on `emrid-dev-app`: `aws dynamodb describe-continuous-backups --table-name emrid-dev-app` → `PointInTimeRecoveryStatus: ENABLED`. If not: enable. PITR is the primary recovery mechanism (restore-to-new-table + repoint `DYNAMODB_TABLE_NAME`).
- [ ] **S3 versioning** on `emrid-dev-documents`: `aws s3api get-bucket-versioning --bucket emrid-dev-documents` → `Enabled`. Protects identity documents from overwrite/delete.
- [ ] **Cognito has NO native backup** — pool loss means credential re-provisioning. Acceptable for the pilot cohort size; record the accepted risk (Risk Register R-18). Keep the practitioner/staff provisioning steps (§12) as the re-provisioning runbook.
- [ ] **Recovery drill (tabletop)**: restore table to `emrid-recovery-test` from PITR, point a local build at it, confirm a customer workspace renders. Document time taken (RTO evidence).
- **Recovery ordering**: table first, then Lambda event-source mapping re-enable, then apps (stateless). Work items/directory/aggregate are re-derivable via the producer + backfill scripts if projections are lost — profiles/emergency/identity/audit are the primary data.
- **RPO**: PITR gives ~5-minute granularity; acceptable for pilot. **RTO target**: half a day (manual restore + repoint), acceptable for pilot — revisit for GA.

## 15. Health & deploy verification (GH-5)

- `GET /api/health` on both apps: secret-free `{ ok, mock: {auth,data,uploads}, ... }`. After EVERY deploy confirm `mock.*` are all `false` (Ops also reports `cognitoConfigured: true`). This replaces log-diving for the `resolved config` line.
- Deployment notifications: enable Amplify build notifications (console → App settings → Notifications) to email on build failure for both apps.
- Rollback: unchanged (redeploy previous Amplify build; apps are stateless; Lambda rollback = re-upload previous producer.zip; table untouched).
