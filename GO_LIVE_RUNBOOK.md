# EMRID Operations — Go-Live Runbook & First Production Protected Life Verification

> Operator-executable guide to connect AWS, deploy, flip mock → live, and verify the **first Production Protected Life**. Companion to [`OPERATOR_HANDOFF.md`](./OPERATOR_HANDOFF.md) (the per-subsystem detail) and [`EMRID_BACKEND_IMPLEMENTATION_GUIDE.md`](./EMRID_BACKEND_IMPLEMENTATION_GUIDE.md) (§19 journey, §22 Definition of Done). All Operations application code is complete and fail-closed; everything below is **operator-owned**.
>
> **Golden rule:** EMRID Operations never provisions AWS. This runbook tells you what to confirm/create in the AWS console (or your IaC) and how to verify the result — the app only *reads flags and config*.

---

## 0. Prerequisites (before you start)

- [ ] Access to the AWS account that hosts the **shared** Patient-Platform infrastructure (DynamoDB table, Cognito pool, S3 bucket).
- [ ] Permission to manage Cognito groups/users, IAM roles, the Amplify app, and a Lambda + DynamoDB Stream.
- [ ] The EMRID Operations repo deploys via **AWS Amplify Hosting** (Next.js SSR). `amplify.yml` and `next.config.mjs` are already in the repo.
- [ ] The five quality gates pass locally on the commit you intend to deploy:
      `npm run typecheck && npm run lint && npm run test && npm run build && npm audit`
      (expected: typecheck/lint clean, **184 tests pass**, build OK, **0 vulnerabilities**).
- [ ] **Pre-go-live contract reconciliation** — ✅ entity enum **values** reconciled and pinned in `tests/shared-contract.test.ts` (`OPERATOR_HANDOFF` §6a). ✅ Audit vocabulary **Option A** decided and the **Ops side is done** (§6b). **One coordinated change remains before live:** apply the Patient-Platform audit additions (`OPS` actor + the four Ops event types + safe timeline handling, listed in §6b) and deploy **both repos together**. Do NOT connect AWS until this lands.
- [ ] A **maintenance/low-traffic window** and a named owner for the go-live.
- [ ] A throwaway **pilot customer** identity (real flow, disposable data) to drive the live journey.

> ⚠️ **Pilot data:** the raw ID number is stored plaintext (KMS-at-rest + TLS) — `OPERATOR_HANDOFF` §7. Use disposable pilot data until tokenisation lands.

---

## 1. Confirm shared AWS resources (reuse — do NOT recreate)

- [ ] **DynamoDB** single table (e.g. `emrid-dev-app`) exists, with **GSI1** (device token) and **GSI2** (audit profile timeline). Note the exact **table name** and **region**.
- [ ] **Cognito** User Pool + a **public app client** (no secret) with `ALLOW_USER_PASSWORD_AUTH` enabled. Note **User Pool ID**, **App Client ID**, **region**.
- [ ] **S3** private document bucket (Block Public Access ON, SSE). Note the **bucket name**. Confirm objects live under `profiles/*`.
- [ ] Decide: same Cognito app client as the Patient Platform, or a dedicated Ops client on the same pool (either works; record the choice).

**Verify:** `aws dynamodb describe-table --table-name <TABLE>` shows `GlobalSecondaryIndexes` GSI1 + GSI2 and `TableStatus=ACTIVE`.

---

## 2. Cognito — Ops staff

- [ ] Create groups in the pool named **exactly** as the `OpsRole` values:
      `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `CUSTOMER_SUPPORT`, `IDENTITY_OFFICER`, `FULFILMENT_OFFICER`, `PRACTITIONER_MANAGER`, `EXECUTIVE`.
- [ ] Create at least one **Ops test user** and add them to `IDENTITY_OFFICER` **and** `FULFILMENT_OFFICER` (so one person can drive the whole journey).
- [ ] Confirm the **ID token** carries `email`, optional `name`, and `cognito:groups` (check the pool's app-client attribute read permissions / token customisation).

**Verify (no console):**
```
aws cognito-idp admin-initiate-auth --user-pool-id <POOL> --client-id <CLIENT> \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=<ops-user>,PASSWORD=<pw>
```
Decode the returned `IdToken` (jwt.io / `jwt-cli`) → confirm `cognito:groups` includes the role names and `email` is present.

---

## 3. IAM

### 3a. Ops app compute role (Amplify SSR)
- [ ] **DynamoDB** on the table: `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`, `TransactWriteItems`; plus `Query` on **GSI1** and **GSI2** ARNs.
- [ ] **S3**: `s3:GetObject` on `arn:aws:s3:::<BUCKET>/profiles/*` (download only).
- [ ] **No `Scan`. No AWS keys in env** — the app uses the role via the default provider chain.

### 3b. Producer Lambda execution role (§7)
- [ ] **Stream**: `dynamodb:GetRecords`, `GetShardIterator`, `DescribeStream`, `ListStreams` on the table **stream ARN**.
- [ ] **Table**: `Query` (idempotency read) + `TransactWriteItems` (dual-write create). No `Scan`.
- [ ] CloudWatch Logs write for the Lambda.

---

## 4. Environment variables (Amplify console → `.env.production` via `amplify.yml`)

| Var | Value | Notes |
|---|---|---|
| `APP_ENV` | `production` | marks production |
| `USE_MOCK_AUTH` | `false` | real Cognito |
| `USE_MOCK_DATA` | `false` | real DynamoDB |
| `USE_MOCK_UPLOADS` | `false` | real S3 |
| `APP_AWS_REGION` | e.g. `eu-west-1` | **NOT** `AWS_*` (Amplify rejects that prefix) |
| `DYNAMODB_TABLE_NAME` | the shared table name | |
| `S3_DOCUMENT_BUCKET` | the shared bucket name | |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | pool id | **set BEFORE build** (inlined) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | app client id | **set BEFORE build** (inlined) |
| `NEXT_PUBLIC_COGNITO_REGION` | region | **set BEFORE build** (inlined) |
| `NEXT_PUBLIC_APP_URL` | the Ops origin (e.g. `https://ops.emrid.co.za`) | |

> The four `NEXT_PUBLIC_*` values are inlined at **build** time — set them before triggering the build, or the client bundle won't have them.

---

## 5. Deploy (Amplify)

- [ ] Connect the repo/branch to the Amplify app; confirm `amplify.yml` writes env → `.env.production` before `next build`.
- [ ] Confirm `next.config.mjs` `serverActions.allowedOrigins` includes the Ops origin (already allow-lists `ops.emrid.co.za` + `*.amplifyapp.com`).
- [ ] Trigger a build/deploy. Watch the build log for the one-time **`[emrid-ops] resolved config`** diagnostic — confirm `useMockAuth/useMockData/useMockUploads = false` and `cognitoConfigured = true` (secret-free; booleans only).

**Verify:** the deployed site loads `/login` (not a 404) and an unauthenticated visit to `/mission-control` redirects to `/login?next=/mission-control`.

---

## 6. DynamoDB Stream → producer Lambda (§10)

- [ ] Enable a **DynamoDB Stream** on the shared table with `StreamViewType = NEW_AND_OLD_IMAGES`.
- [ ] Deploy a small Node Lambda whose handler imports `produceFromStreamRecords` from `lib/work/producer` and calls it with `event.Records`, the **real** repositories (`getWorkItemRepository()`, `getProfileRepository()` with `USE_MOCK_DATA=false`), and `now = new Date().toISOString()`.
- [ ] Create the **event-source mapping** stream → Lambda. (Optional: a filter on `SK = PROFILE` / `SK = DEVICE` to cut invocations; the producer no-ops on the rest anyway.)
- [ ] Configure a **DLQ / bisect-on-error** on the mapping.

**Verify:** see §9 (the live walk) — a real identity submission should produce exactly one `VERIFY_IDENTITY` item; CloudWatch shows `created: true`.

---

## 7. Protected-Lives aggregate backfill (§9)

- [ ] One-off: write the initial aggregate row so the hero starts from truth (it is then maintained by Ops boundary crossings):
```
aws dynamodb put-item --table-name <TABLE> --item '{
  "PK": {"S":"AGGREGATE#PROTECTED_LIVES"}, "SK": {"S":"CURRENT"},
  "type": {"S":"PROTECTED_LIVES_AGGREGATE"},
  "protectedCount": {"N":"<count from a one-off census>"},
  "inProgressCount": {"N":"<count>"},
  "version": {"N":"0"}, "lastUpdatedAt": {"S":"<ISO now>"}
}'
```
- [ ] Record who owns the periodic **reconciliation** job (drift from Patient-Platform-only crossings) — operator-owned, future Stream-hosted.

> If you skip the backfill the figure simply starts at 0 and only counts crossings observed from go-live forward — acceptable for a pilot, not for a real coverage number.

---

## 8. Pre-flight checks (before touching the pilot customer)

- [ ] `/login`: a wrong password shows the calm inline error; correct credentials land on `/mission-control`; the account-menu **Sign out** clears the session back to `/login`.
- [ ] Mission Control renders; the **Protected Lives** hero shows the backfilled number (or 0).
- [ ] An empty Identity queue renders without error (`/identity-verification`).
- [ ] No mock indicators: the "Mock session" pill is **absent**.

---

## 9. Live verification — the First Production Protected Life (handbook §19)

Drive one real pilot customer end-to-end. (P = Patient Platform, O = Ops.)

| # | Step | Do | Expected | Evidence |
|---|---|---|---|---|
| 1 | Register + log in | (P) pilot signs up & logs in | Cognito user exists | screenshot |
| 2 | Complete profile | (P) fill profile | `PROFILE#<id>/PROFILE` item written | item JSON |
| 3 | Emergency profile | (P) add blood type/allergy + 1 contact | `PROFILE#<id>/EMERGENCY` item | item JSON |
| 4 | Upload identity | (P) submit ID → status `PENDING` | Document + isolated `IDENTITY` item; Profile `identityVerificationStatus=PENDING` | item JSON |
| 5 | **Producer fires** | (O) Stream → Lambda | exactly **one** `VERIFY_IDENTITY` Work Item (`<id>-identity`); replay creates no duplicate | CloudWatch `created:true`; queue row |
| 6 | Readiness | (O) open the customer Workspace | appears NOT_READY/NEARLY; identity factor unmet | screenshot |
| 7 | Approve identity | (O, `IDENTITY_OFFICER`) review ID (presigned GET) → **Approve identity** | Work Item DONE; Profile `VERIFIED`; `IDENTITY_VERIFIED` audit; readiness rises; **no boundary crossing yet** (no card) | screenshot + audit |
| 8 | Fulfil card | (O, `FULFILMENT_OFFICER`) Card Fulfilment → Start encoding → Mark encoded → Mark dispatched | device → ACTIVE; `CARD_ACTIVATED` audit | screenshot + audit |
| 9 | **Protected** | (O/S) recompute | Protection Status **PROTECTED**, readiness **100%**; **Protected Lives +1** | hero before/after |
| 10 | NFC tap | (P) tap device / open public `/e/<token>` | public emergency view shows only `PUBLIC_EMERGENCY` fields | screenshot |

---

## 10. Evidence to capture (attach to the go-live ticket)

- [ ] Build log line: `[emrid-ops] resolved config` with all mock flags `false`, `cognitoConfigured: true`.
- [ ] Decoded Ops ID token showing `cognito:groups`.
- [ ] CloudWatch log of the producer: one `created: true` for the pilot, and a `created: false / exists` on a deliberate replay.
- [ ] DynamoDB items: `PROFILE`, `EMERGENCY`, `IDENTITY` (existence only — **never copy the raw ID number**), the `VERIFY_IDENTITY` Work Item (both projections), the device ACTIVE item, the `AGGREGATE#PROTECTED_LIVES` row before/after.
- [ ] Audit events `IDENTITY_VERIFIED` + `CARD_ACTIVATED` for the pilot.
- [ ] Protected Lives hero screenshots before (N) and after (N+1).
- [ ] Public `/e` responder screenshot (PUBLIC_EMERGENCY fields only).

---

## 11. Rollback

The app is stateless behind flags; rollback is fast and data-safe (no destructive writes are introduced by go-live).

- [ ] **Fastest:** in Amplify set `USE_MOCK_DATA=true`, `USE_MOCK_AUTH=true`, `USE_MOCK_UPLOADS=true` (or redeploy the previous build) → Ops reverts to mock; **the shared table is untouched**.
- [ ] **Disable the producer:** turn off the event-source mapping (stops new Work Item creation) — existing items remain valid.
- [ ] **Bad data:** Work Items are idempotent and re-derivable; a mis-created Work Item can be transitioned to `CANCELLED` (never hard-delete profiles/identity).
- [ ] **Aggregate wrong:** re-run the §7 backfill `put-item` with corrected counts (it's a single row).
- [ ] Ops introduces **no schema migration** — rolling back the Ops app cannot corrupt Patient-Platform data.

---

## 12. Expected failure modes & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Every route 404s / redirects to `/login` loop | `/login` reachable? middleware matcher | confirm deploy includes `app/login`; `/login` excluded from middleware (it is) |
| `/login` rejects valid creds | `ALLOW_USER_PASSWORD_AUTH` off, or wrong client id/region | enable the auth flow; re-check `NEXT_PUBLIC_COGNITO_*` (set **before build**) |
| Signed in but "access" issues / wrong identity | groups not named exactly as `OpsRole`; token missing `cognito:groups` | rename groups; fix app-client token claims |
| App errors loudly on data reads | `DYNAMODB_TABLE_NAME` unset / role lacks table perms | set env; attach §3a policy |
| `listByIdentityStatus`-style error | (shouldn't occur) legacy path | queues read `WORK#<domain>` only; ensure producer seeded the work items |
| ID document won't open | S3 `GetObject` missing / wrong bucket | attach §3a S3 policy; check `S3_DOCUMENT_BUCKET` |
| No Work Item after identity submission | Stream/Lambda not wired; wrong `StreamViewType` | enable stream `NEW_AND_OLD_IMAGES`; check mapping; CloudWatch |
| Duplicate Work Items | (shouldn't occur) | ids are deterministic + create is conditional — check the Lambda isn't rewriting ids |
| Protected Lives stuck / wrong | not backfilled, or crossing happened via a Patient-Platform-only event | run §7 backfill; schedule reconciliation |
| Mock pill still showing | a `USE_MOCK_*` not `false`, or `APP_ENV` unset | fix env; redeploy (prod fails closed to real, but explicit flags win) |

---

## 13. Final success criteria (handbook §22)

- [ ] Deployed build runs with `USE_MOCK_*=false` (config diagnostic confirms).
- [ ] Cognito live: Ops staff sign in; roles from groups.
- [ ] DynamoDB live (shared table, GSI1/GSI2; no scans).
- [ ] S3 live: ID document reviewed via presigned GET.
- [ ] Producer operational: a real submission creates a Work Item (idempotent).
- [ ] Identity approval persists decision + audit + re-projection.
- [ ] Card fulfilment: encode → dispatch → device ACTIVE.
- [ ] Public NFC tap shows the filtered emergency view.
- [ ] **One real customer reaches PROTECTED end-to-end — the First Production Protected Life — with evidence captured.**
- [ ] Five gates pass against the deployed commit.
