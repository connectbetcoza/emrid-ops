# EMRID — Joint Go-Live Checklist (Patient Platform + Operations)

> One page. The single execution list for AWS connect + the First Production Protected Life. Detail lives in [`GO_LIVE_RUNBOOK.md`](./GO_LIVE_RUNBOOK.md) (§refs) and [`OPERATOR_HANDOFF.md`](./OPERATOR_HANDOFF.md). **No AWS is provisioned by either codebase.** Tick top-to-bottom; do not skip a gate.

## 0. Pre-deploy — both repos green & aligned
- [ ] **Operations** (`emrid-ops`): 5 gates pass (typecheck · lint · **186 tests** · build · 0 vulns).
- [ ] **Patient Platform** (`emrid`): 5 gates pass (typecheck · lint · **150 tests** · build · 0 vulns).
- [ ] **Audit vocabulary aligned** (must match before any real Ops audit write):
      • Ops writes `actorType:"OPS"` + `IDENTITY_VERIFIED`/`IDENTITY_REJECTED`/`CARD_ACTIVATED`/`OPS_WORK_TRANSITION` — pinned in `emrid-ops/tests/shared-contract.test.ts`.
      • Patient accepts/renders them — pinned in `emrid/tests/audit-ops-vocabulary.test.ts`.
- [ ] **Entity enum values reconciled** (`OPERATOR_HANDOFF` §6a) — pinned both sides.

## 1. Deploy order
- [ ] **1st — Patient Platform** (must accept the new audit vocabulary *before* Ops emits it). Deploy `emrid`; confirm healthy.
- [ ] **2nd — Operations.** Deploy `emrid-ops` (steps below). Order matters only for the audit-vocabulary dependency; both should ship in the same window.

## 2. AWS resources (confirm, reuse — never recreate) — runbook §1
- [ ] DynamoDB shared table **ACTIVE**, **GSI1 + GSI2** present. Note name + region.
- [ ] Cognito User Pool + **public app client** (`ALLOW_USER_PASSWORD_AUTH`). Note pool/client/region.
- [ ] S3 private bucket (Block Public Access ON, SSE); objects under `profiles/*`.

## 3. Cognito — runbook §2
- [ ] Groups named **exactly** as `OpsRole`s (`SUPER_ADMIN`…`EXECUTIVE`).
- [ ] One Ops test user in **IDENTITY_OFFICER + FULFILMENT_OFFICER**.
- [ ] ID token carries `email` + `cognito:groups` (verify via `admin-initiate-auth` + decode).

## 4. IAM — runbook §3
- [ ] **Ops app role:** DynamoDB `GetItem/Query/PutItem/UpdateItem/DeleteItem/TransactWriteItems` + `Query` on GSI1/GSI2; S3 `GetObject` on `profiles/*`. **No `Scan`. No keys.**
- [ ] **Producer Lambda role:** stream `GetRecords/GetShardIterator/DescribeStream/ListStreams` + table `Query`/`TransactWriteItems` + Logs.

## 5. Environment variables (set **before build**) — runbook §4
- [ ] `APP_ENV=production`; `USE_MOCK_AUTH/DATA/UPLOADS=false`.
- [ ] `APP_AWS_REGION` (not `AWS_*`), `DYNAMODB_TABLE_NAME`, `S3_DOCUMENT_BUCKET`.
- [ ] `NEXT_PUBLIC_COGNITO_USER_POOL_ID/CLIENT_ID/REGION`, `NEXT_PUBLIC_APP_URL` (inlined — before build).

## 6. Deploy verification — runbook §5
- [ ] Build log shows `[emrid-ops] resolved config` → all mock flags **false**, `cognitoConfigured:true`.
- [ ] `/login` loads; unauthenticated `/mission-control` → `/login?next=…`; no "Mock session" pill.

## 7. Work Item producer — runbook §6
- [ ] DynamoDB **Stream ON** (`NEW_AND_OLD_IMAGES`).
- [ ] Lambda deployed (calls `produceFromStreamRecords` with real repos) + event-source mapping + DLQ.

## 8. Protected-Lives aggregate backfill — runbook §7
- [ ] One-off `put-item` for `AGGREGATE#PROTECTED_LIVES / CURRENT` with the current census counts.
- [ ] Reconciliation-job owner recorded.

## 9. Pre-flight — runbook §8
- [ ] Login (good/bad creds) + sign-out work. Mission Control hero shows the backfilled number. Empty Identity queue renders.

## 10. Live — First Production Protected Life (P=Patient, O=Ops) — runbook §9
- [ ] (P) register → login → complete profile → emergency profile → **submit identity** (status PENDING).
- [ ] (O) **producer creates one `VERIFY_IDENTITY`** (CloudWatch `created:true`; deliberate replay → `exists`, no duplicate).
- [ ] (O) Workspace → **Approve identity** (Profile VERIFIED + `IDENTITY_VERIFIED` audit; readiness rises; no crossing yet).
- [ ] (O) Card Fulfilment → encode → mark encoded → **dispatched** (device ACTIVE + `CARD_ACTIVATED` audit).
- [ ] (O/S) **PROTECTED at 100% readiness; Protected Lives +1.**
- [ ] (P) **NFC tap / `/e/<token>`** shows only `PUBLIC_EMERGENCY` fields.

## 11. Evidence to capture — runbook §10
- [ ] Config diagnostic (flags false) · decoded Ops token (`cognito:groups`) · producer logs (created + replay-skip) · key items (PROFILE/EMERGENCY/IDENTITY existence — **never the raw ID number**) · Work Item (both projections) · device ACTIVE · audit `IDENTITY_VERIFIED`+`CARD_ACTIVATED` · aggregate before/after · Protected Lives N→N+1 · `/e` responder view.

## 12. Rollback trigger points — runbook §11
- [ ] **Auth/data errors at scale, or any wrong write** → set `USE_MOCK_*=true` (or redeploy previous) → Ops reverts to mock; **shared table untouched**.
- [ ] **Producer misbehaving / duplicates** → disable the event-source mapping (ids are deterministic + create is idempotent, so no duplicates expected).
- [ ] **Bad Work Item** → transition to `CANCELLED` (never hard-delete profiles/identity).
- [ ] **Aggregate wrong** → re-run §8 backfill with corrected counts.
- [ ] Ops introduces **no schema migration** — rolling back Ops cannot corrupt Patient data.

## ✅ Done when
One real customer reaches **PROTECTED end-to-end** with evidence captured, and both deployed builds pass their 5 gates. — *the First Production Protected Life.*
