# EMRID Operations — Project Handover (Engineering Context)

> Authoritative context for continuing EMRID Operations engineering with zero prior conversation. Written 2026-07-04. Reflects the system exactly as it exists today. Companion authoritative docs in this repo: `EMRID_BACKEND_IMPLEMENTATION_GUIDE.md` (spine), `PRODUCT_ARCHITECTURE.md` (architectural law), `UX_PRINCIPLES.md`, `DESIGN_LANGUAGE.md`, `DESIGN_SYSTEM.md`, `OPERATOR_HANDOFF.md` (operator runbook, §-referenced below), `GO_LIVE_RUNBOOK.md`, `JOINT_GO_LIVE_CHECKLIST.md`.

---

## 1. PROJECT OVERVIEW

**EMRID ("Emergency Rescue Identification")** is a healthcare identity platform: an NFC card that surfaces a patient's public emergency medical information at a public URL (`/e/<token>`) with no login — "the card that could save your life when you can't speak for yourself."

Two products, one shared AWS infrastructure:
- **Patient Platform** (`emrid/` repo) — patient-owned: registration, profiles, emergency data with field-level visibility, devices/cards, documents, identity submission, practitioner portal, public responder route. **Live in production.**
- **EMRID Operations** (`emrid-ops/` repo) — staff-facing operating system: identity verification, card fulfilment, practitioner management, customer support, readiness, executive view. **Live in production** (one pending deployment bundle — see §7).

**North star:** Protected Lives — customers who are identity-VERIFIED + have emergency info + an ACTIVE card. The **First Production Protected Life was achieved** (John Doe) end-to-end through both platforms.

**Development philosophy:** the product/UX/IA architecture is FROZEN. Work is faithful implementation in vertical slices, each ending with five quality gates green (`typecheck`, `lint`, `test`, `build`, `npm audit` — no exceptions) and a pause for review. Patient Platform is the source of functional truth; Operations consumes projections and writes only decisions/operational state. Mock adapters are the local default; production fails closed to real AWS.

## 2. ARCHITECTURE

**Repos:** `~/Desktop/EMRID/emrid` (Patient) and `~/Desktop/EMRID/emrid-ops` (Operations). Next.js 15 App Router, TS, Tailwind (semantic tokens only), Vitest. No shared package — Ops carries a **frozen mirror** of the shared contract (`lib/data/entities.ts`, `lib/data/aws/keys.ts`), byte-compatible with Patient's `types/*` + `lib/data/aws/keys.ts`, pinned by `tests/shared-contract.test.ts` (key strings AND enum value sets via exhaustive `Record<Union, true>`).

**Shared AWS (account `621594241605`, `eu-west-1`):**
- **DynamoDB** single table `emrid-dev-app`, GSI1 (`GSI1PK/SK` — device token lookup), GSI2 (`GSI2PK/SK` — audit profile timeline). **No table scans exist anywhere in runtime code** (a legal law, not a habit). Stream enabled `NEW_AND_OLD_IMAGES`.
- **Cognito** pool `eu-west-1_B3YWPgLWW`, public app client `7fg529rsb2ae1jrukvv7oi9mkd` (no secret, `USER_PASSWORD_AUTH`). Ops roles come from Cognito groups named exactly as `OpsRole` values.
- **S3** private bucket `emrid-dev-documents` (Ops: presigned GET only, `profiles/*`).
- **Producer Lambda** `emrid-work-item-producer` — DynamoDB Stream consumer, entrypoint `lambda/work-item-producer.ts` (thin adapter over `lib/work/producer.ts`).

**Key patterns (single table):**
```
Profile        PROFILE#<id> / PROFILE            Identity(raw)  PROFILE#<id> / IDENTITY (isolated)
Emergency      PROFILE#<id> / EMERGENCY          Document       PROFILE#<id> / DOCUMENT#<docId>
Device         DEVICE#<id> / DEVICE (+GSI1 TOKEN#<token>)  + copy PROFILE#<id> / DEVICE#<id>
Practice       PRACTICE#<id> / PRACTICE          Practitioner   PRACTITIONER#<id> / PRACTITIONER
PatientAccess  PRACTITIONER#<id> / PATIENT#<profileId> (+ inverse in PROFILE#)
Audit          AUDIT#<targetType>#<targetId> / TS#<ts>#<eventId>  (+GSI2 when profile-linked; append-only, attribute_not_exists)
Work (queue)   WORK#<domain> / STATUS#<s>#PRIORITY#<p>#DUE#<d>#WORK#<id>     ← Ops-owned
Work (subject) PROFILE#<subjectId> / WORK#<status>#<id>                      ← Ops-owned dual-write
Aggregate      AGGREGATE#PROTECTED_LIVES / CURRENT                           ← Ops-owned
Directory      DIRECTORY / CUSTOMER#<profileId>  and  DIRECTORY / PRACTITIONER#<id>  ← Ops-owned
```

**Producer Lambda (`lib/work/producer*.ts`, `lib/work/stream.ts`):** parses stream records (own unmarshaller, no `@aws-sdk/util-dynamodb` dep), then:
- Profile → identity `PENDING` ⇒ create `VERIFY_IDENTITY` work (deterministic id `<id>-identity`).
- Device → `PENDING` ⇒ create `ISSUE_CARD` work (`<id>-card`).
- Practitioner → `PENDING` ⇒ create `APPROVE_PRACTITIONER` work (`<id>-practitioner`; subject name from stream image).
- **State-sync:** Device → `ACTIVE` (real customer activation) ⇒ complete `ISSUE_CARD` work (terminal status = replay dedupe marker), apply the Protected-boundary aggregate crossing exactly once (`cardActiveBefore` accounts for other ACTIVE devices), audit `OPS_WORK_TRANSITION` (SYSTEM, `trigger: CARD_ACTIVATED`).
- **Directory refresh:** ANY profile-linked change (PROFILE/EMERGENCY/DEVICE/WORK/AUDIT) ⇒ recompute-from-truth upsert of that customer's directory entry; PRACTITIONER changes ⇒ practitioner entry. `PK=DIRECTORY` items are ignored (self-loop guard). Recompute-from-truth ⇒ idempotent under replay.

**Work Engine (`lib/work/*`):** `WorkItem`/`WorkItemRecord` (mapped 1:1 by `record.ts`); types→domains via exhaustive `WORK_TYPE_META`; actions from `workActions({type,status,step})` (per-type `steps[]` + optional defer); `planTransition({type,toStatus,decision?})` maps a UI transition to its persistence plan (`IDENTITY_DECISION` / `CARD_ACTIVATION` / `PRACTITIONER_DECISION` / `AUDIT_ONLY` / `UNSUPPORTED` — fails closed); `executeTransition(deps, input)` orchestrates: move item (dual-write; same-SK transitions overwrite in place — DynamoDB rejects delete+put on one item), apply the shared-state write, adjust the aggregate on Protected-boundary crossings (identity/card plans only), append audit (`targetType USER` for PRACTITIONER-domain work, else `PROFILE`). Server actions (`lib/work/server-actions.ts`): `transitionWorkItem`, `decidePractitioner`. `WorkItem.customerId` is semantically the **subject id** (customer or practitioner).

**Queues are projections:** one generic `Queue`/`WorkQueue` component; every queue page = `listByDomain(<DOMAIN>)` rendered through it. Rows link to the subject workspace via `workSubjectHref(domain, id)` (PRACTITIONER → `/practitioners/[id]`, else `/customers/[id]`). Queue primary bulk action runs the real per-item transition; "Assign to me" is still an honest mock.

**Directory projection (no-scan listing):** producer-maintained entries with operational fields only (never medical values). Customer entry: names, emrid, identity status, verification level, protection status, readiness score + factor inputs, active work count, last activity, joinedAt, optional practitionerId (schema-ready, unpopulated). Practitioner entry: name, email, practiceId/Name, status. Consumed by `/customers`, `/practitioners`, ⌘K palette (server layout feeds live commands), Mission Control customer widgets.

**Workspaces:** ONE Customer Workspace (`/customers/[id]`) — the only customer view; fixture-free (`getCustomerState` = Profile+Device+Emergency repos via `customerFromState`); tabs Overview/Active Work/Notes; rail = Readiness card, Summary, Card Fulfilment Pack (when card work active), Quick Actions (= top-priority real work item); timeline = real audit trail (GSI2). Practitioner Workspace (`/practitioners/[id]`) — a second *record surface* on the same `<Workspace>` framework (sanctioned; not a customer view): details, practice, status, Manage tab (edit particulars), linked patients (read-only grants), audit timeline, review panel for admin-created pending work.

**Mission Control:** Protected Lives hero (aggregate-backed), Needs Attention + Readiness Distribution (directory-backed), Today's Work (live work index, all domains). Briefing/Health/Alerts/Activity engines remain deterministic-static (`lib/engines/*`, output-only contracts, swappable later).

**Protection/Readiness engines (pure cores):** `computeReadiness` (weighted factors: profile 15, identity 30, emergency 25, contact 15, card 15; bands READY ≥85 / NEARLY 60–84 / NOT_READY <60); `protectionStatusFromFacets` (PROTECTED = identity VERIFIED ∧ card ACTIVE ∧ emergency present) — the single source both `executeTransition` and the producer route through, so surfaces can never disagree. Readiness ≠ Protection (a customer can be Protected at 85% readiness — missing contact factor).

**Repository/factory/mock/fail-closed:** interfaces in `lib/data/types.ts`; factory `lib/data/index.ts` `pickMigrated(mock, aws)` on `USE_MOCK_DATA`. Repos: Profile, Document, Audit, WorkItem, Device, EmergencyProfile, Aggregate, Directory, Practitioner. Dynamo adapters take injectable `DynamoDeps` (tests inject fake `doc.send` and assert exact commands — AWS correctness proven without AWS). Mock adapters share one `globalThis` store seeded from `MOCK_CUSTOMERS` (fixtures live ONLY in mock adapters + tests + `/design`; zero runtime fixture reads). Config (`lib/config`): three flags `USE_MOCK_AUTH/DATA/UPLOADS` default mock outside production, **fail closed to real** when `APP_ENV=production` or `NODE_ENV=production`; secret-free boot diagnostic `[emrid-ops] resolved config`.

**Auth:** credential-free Cognito (fetch to IdP JSON API, public client), httpOnly cookies (`emrid_ops_id_token`, `emrid_ops_refresh_token`), `aws-jwt-verify`, roles from `cognito:groups`, `/login` route (open-redirect-guarded `next`), sign-out revokes+clears. `requireOpsUser()` guards the `(ops)` shell; Edge middleware adds a cookie-presence gate.

**Audit vocabulary (Option A — cross-product, both repos aligned & pinned):** Ops writes first-class events: `IDENTITY_VERIFIED`, `IDENTITY_REJECTED`, `CARD_ACTIVATED`, `OPS_WORK_TRANSITION`, `PRACTITIONER_APPROVED`, `PRACTITIONER_REJECTED`, `PRACTITIONER_ONBOARDED`, `PRACTITIONER_UPDATED`; actor `OPS` added to the shared `AuditActorType`. Patient renders all with labels; `DEVICE_TAP_TESTED` is written by Patient's `/e` on PENDING-card taps (fulfilment tap-test) and read by Ops.

## 3. CURRENT OPERATIONAL MODEL

**Patient journey (Patient Platform, live):** register/login (Cognito) → complete profile (`PROFILE` item) → emergency profile (`EMERGENCY` item, field-level visibility) → submit identity (S3 doc + isolated `IDENTITY` item + Profile status `PENDING`) → request card (Device `PENDING` with token + activation code) → **activate card with activation code** (Device `ACTIVE`, code consumed) → **PROTECTED** → NFC tap `/e/<token>` shows the filtered public emergency view (audited).

**Operations journey (Ops Platform, live):**
- **Identity:** producer creates `VERIFY_IDENTITY` → Identity queue → Customer Workspace → review ID document (presigned GET) → Approve → Profile `VERIFIED` + audit + re-projection.
- **Card Fulfilment:** producer creates `ISSUE_CARD` → Fulfilment queue → Workspace **Card Fulfilment Pack** (EMRID, device id, token, NFC URL on the *Patient* origin, activation code, last tap) → Start encoding → Mark encoded → Mark tap verified → Mark dispatched → **WAITING** (Ops NEVER activates — operational truth) → customer activates → state-sync completes the work + counts the Protected Lives crossing.
- **Practitioner Management (V1: Administration owns creation, NO public sign-up exists anywhere):** `/practitioners` = roster (directory) + search + **Onboard practitioner** (internal form → Practice + Practitioner records, ACTIVE by default, optional Cognito-sub link, else "credentials pending" notice) → Practitioner Workspace: Manage tab (edit name/email/registration/status/practice details — audited), linked patients, audit. Review panel appears only for admin-created PENDING records (Activate / Decline + required note → `status`+`statusNotes`, read back by the practitioner portal's pending page).
- **Customer Support:** SUPPORT queue projection (AUDIT_ONLY tracking transitions). No producer source yet (no Patient in-app support submission exists).
- **Executive:** live Protected Lives + in-progress + open-work-by-domain. **Administration:** runtime adapter status (secret-free) + role reference; practitioner creation ownership noted.
- **Mission Control:** the four questions, all customer/work surfaces production-backed.

## 4. COMPLETED SPRINTS

| Sprint / Slice | Objective | Architecture changes | Status |
|---|---|---|---|
| Slice 1 — `/login` | Auth entry (was a 404 blocker) | `login-core` (open-redirect guard, error mapping), signIn/signOut actions, UserMenu wiring | ✅ Live |
| Slice 2 — Emergency repo | Fully repo-backed readiness | `EmergencyProfile` mirror + `EMERGENCY` key + repo; `facets.ts` pure derivations | ✅ Live |
| Slice 3 — Protected Lives aggregate | Real north-star figure | Ops-owned aggregate item, atomic ADD, boundary-crossing in `executeTransition`, hero+engine rewire | ✅ Live |
| Slice 4 — Work Item producer | Real submissions create work | producer-core/stream/producer + Lambda entrypoint; idempotent `create` (conditional dual-write) | ✅ Live |
| Slice 5 — Contract reconciliation | Kill mirror drift | Enum values aligned to Patient (`NONE`→`UNVERIFIED` was a live bug), value pins, audit vocabulary Option A both repos | ✅ Live |
| Go-live + provisioning | First Production Protected Life | Runbooks; streams enabled; Lambda deployed; aggregate seeded; Cognito/IAM/Amplify by operator | ✅ Achieved (John Doe) |
| Card Fulfilment patch | Fulfilment pack + honest flow | 4-step flow ending WAITING (dispatch never activates), pack UI, `DEVICE_TAP_TESTED` seam (Patient `/e`), `NEXT_PUBLIC_PATIENT_APP_URL`, Device.activationCode mirror; same-SK transition fix (live `ValidationException` bug) | ✅ Live |
| State-sync patch | Projections match activation truth | Producer completes card work on Device→ACTIVE + counts crossing; Lambda esbuild recipe fixed (`server-only` stub alias) | ✅ Live |
| Live reconciliation | Historical users | Read-only `scripts/reconcile-report.mjs` (scan mode = operator); Phase-2 backfill executed: aggregate {0,3}→{1,2}, John's card work DONE via production path, Robyn + Michael be8eee75 work items created | ✅ Done |
| Operational Completeness (Slice A) | Kill placeholders | 6 stub pages → real (readiness/support/practitioners/work-items queues, executive, administration); audit-backed timeline; real Quick Actions; readiness/support = AUDIT_ONLY; mock components deleted | ✅ Built, **in pending deploy bundle** |
| Slice D — Customer Directory | Kill MOCK_CUSTOMERS at runtime | Directory projection + producer refresh + backfill script; fixture-free `getCustomerState`; live palette; Today's Work → live work index | ✅ Built, **in pending deploy bundle** |
| Slice B — Practitioner Management v1 (re-scoped twice: approval → management; + onboarding) | Department completeness | Practitioner/Practice/Access mirrors + repo (incl. creates/updates), `PRACTITIONER_DECISION` transition, producer intent, practitioner directory + search, Practitioner Workspace + Manage tab + onboarding form (2-section, redirect to new record), backfill script practitioner support; Patient: `REJECTED`+`statusNotes` contract extension + pending-page rendering + 4 audit events | ✅ Built + polish pass done, **in pending deploy bundle** |

## 5. CURRENT SYSTEM STATUS

**Live in production today:** Ops app (build predating Slices A/D/B), Cognito login, Identity verification E2E, Card fulfilment E2E (incl. pack? — NO: pack is in the pending bundle if the last deployed build predates it; fulfilment flow itself is live and was exercised), state-sync Lambda (completion path verified live), Protected Lives aggregate `{1,2,v2}`, Patient Platform fully live incl. `/e` tap auditing.

**Built, gates green, NOT yet deployed (one bundle):** Operational Completeness pages, audit-backed timeline, real Quick Actions, Customer Directory (+ fixture-free customers index, live ⌘K, live Mission Control widgets, live Today's Work), Practitioner Management v1 (+ Patient-side contract/audit/pending-page changes), producer Lambda bundle with directory refresh + practitioner intent, backfill script (customers + practitioners).

**Gates at handover:** Ops — typecheck/lint/build clean, **229 tests / 26 files**, 0 vulns. Patient — all five green, **151 tests**.

## 6. LIVE DATA (verified against production DynamoDB during reconciliation)

- **11 real customer profiles.** Aggregate: `{protectedCount: 1, inProgressCount: 2, version: 2}`.
- **Protected Lives = 1:** John Doe (`profile_58af8916-e92a-441f-96d0-3a4c4c08a178`, EMR-2J3JZ2) — identity work DONE, card work DONE, device `device_2a71fabf-…` ACTIVE, readiness truthfully 85% (0 emergency contacts), real responder taps recorded.
- **Robyn Holmes** (`profile_37115ef3-…`, EMR-AAR7WZ): identity PENDING; **TWO PENDING devices** (`device_2cd9ecb3-…` used for the card work; duplicate `device_4e8d5bde-…` flagged for Patient-side cleanup); work items `…-identity` + `…-card` OPEN (backfilled). Next natural Protected Life candidate.
- **Michael Edwards** (`…be8eee75`, EMR-33F3F3): identity PENDING (work OPEN, backfilled); ACTIVE card + emergency ✓ ⇒ **approving his identity will make him Protected #2 automatically** (executeTransition crossing → aggregate {2,1}).
- **Excluded by operator decision** (no work backfill, not census-counted): Live Test (EMR-TEST01), Lerato Verify (EMR-ETEST1), Jeff Epstein, John Smtih, Bob Wagger; **conditionally excluded "for now":** Cameron Edwards (`…2289129c`, identity PENDING, no work item), Michael Edwards (`…103b2da7`, PENDING device `device_9b76b203-…`, no card work).
- **Practitioner:** Dr Michael Edwards / Edwards Family Practice expected as the first real practitioner — existence in live table unverified; surfaces via `backfill-directory.mjs` if present, else onboard via the new form.
- **Backfill status:** work items + aggregate reconciled ✅; **Customer/Practitioner Directory backfill NOT yet run** (script ready, needs the new Lambda deployed first).

## 7. DEPLOYMENT PROCESS

**Order (the pending bundle):**
1. **Patient Platform** first (must accept: `PractitionerStatus.REJECTED`, `Practitioner.statusNotes`, 6 Ops audit event types, pending-page rejected state) — Amplify deploy of `emrid`.
2. **Ops app** — Amplify deploy of `emrid-ops`. Watch build log for `[emrid-ops] resolved config` (all mock flags false, `cognitoConfigured: true`).
3. **Producer Lambda** rebuild + upload (verified recipe — `server-only` is NOT an installed package, alias it):
```bash
cd emrid-ops
npx esbuild lambda/work-item-producer.ts --bundle --platform=node --target=node20 \
  --format=cjs --tsconfig=tsconfig.json "--external:@aws-sdk/*" \
  "--alias:server-only=./lambda/server-only-stub.js" \
  --outfile=dist/lambda/producer/index.js
node -e "require('./dist/lambda/producer/index.js'); console.log('ok')"
grep -c "CUSTOMER_DIRECTORY\|PRACTITIONER_DIRECTORY" dist/lambda/producer/index.js  # expect ≥2
( cd dist/lambda/producer && rm -f ../../../producer.zip && zip -qr ../../../producer.zip index.js )
aws lambda update-function-code --function-name emrid-work-item-producer \
  --zip-file fileb://producer.zip --region eu-west-1 --profile <admin>
```
4. **Backfill** (one-off, admin creds — script scans, then drives everything through the production Lambda with status-unchanged touch events; creates no work): `AWS_PROFILE=<admin> node scripts/backfill-directory.mjs --dry-run` then without `--dry-run` (now covers profiles AND practitioners).
5. **Verify:** `/customers` + ⌘K list 11 real customers; Mission Control fully live; `/practitioners` roster + onboarding round-trip; Robyn/Michael visible in Identity queue; a Manage-tab save audits `PRACTITIONER_UPDATED`.

**Env vars (Amplify, `NEXT_PUBLIC_*` BEFORE build):** `APP_ENV=production`, `USE_MOCK_AUTH/DATA/UPLOADS=false`, `APP_AWS_REGION=eu-west-1` (never `AWS_*` — Amplify rejects), `DYNAMODB_TABLE_NAME=emrid-dev-app`, `S3_DOCUMENT_BUCKET=emrid-dev-documents`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID/CLIENT_ID/REGION`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PATIENT_APP_URL` (Patient origin — NFC URLs; falls back to APP_URL only for single-origin dev). `amplify.yml` persists these into `.env.production` pre-build.

**IAM:** Ops compute role — table `GetItem/Query/PutItem/UpdateItem/DeleteItem/TransactWriteItems` + `Query` on GSI1/GSI2 + `s3:GetObject profiles/*`. Lambda role — stream reads + table `GetItem/Query/PutItem/UpdateItem/DeleteItem` + logs (+ DLQ SendMessage). **No `Scan` anywhere. No AWS keys in env** (roles via default chain).

**AWS caveats learned live:** local `default` AWS profile = `riskops-deploy` in the WRONG account (`877295316242`); always use `--profile emrid-dev` (read-limited `emrid-dev-local`) or an admin profile in `621594241605`. `emrid-dev-local` cannot Scan/Lambda/IAM/Logs — operator runs those. A `TransactWriteItems` cannot contain two ops on one item (same-status transitions must Put-overwrite — already handled in code). Temporary grants (Scan, InvokeFunction) were issued during reconciliation and were flagged for revocation.

## 8. CURRENT DEPARTMENT STATUS

| Department | Status | Remains |
|---|---|---|
| Identity Verification | **Complete** (live E2E) | explicit reject-with-notes UI (code path exists via `IDENTITY_REJECTED`; only "Request resubmission" defer exposed) |
| Card Fulfilment | **Complete** (live E2E incl. real activation state-sync) | pack UI ships in pending bundle; WAITING-after-dispatch "Resume" dead-end corner |
| Practitioner Management | **Complete for V1** (pending deploy) | credential automation; practice reuse/dedup; verify/onboard Dr Michael Edwards live |
| Customer Support | **In Progress** | queue is real but has no producer source (no Patient support-submission exists); manual work creation UI absent |
| Administration | **In Progress** | read-only status page done; practitioner creation lives under /practitioners; staff mgmt stays in Cognito |
| Executive | **Complete for V1** | trends/history (weekly delta) deferred |
| Mission Control | **Complete for V1** | Briefing/Health/Alerts/Activity engines still deterministic-static |

## 9. KNOWN TECHNICAL DEBT

**Immediate (pre-scale, tracked):**
- Plaintext raw ID number in the isolated `IDENTITY` item (KMS-at-rest + TLS only) — encrypt/tokenise before scaling. Shared with Patient.
- Shared-contract mirror (no shared package) — value pins guard Ops-side drift; Patient-side drift undetectable. Extract shared package + CI check.
- Pending-bundle deployment gap: production runs pre-directory code while the repo is 3 slices ahead.

**Later:**
- Refresh-token rotation (~1h forced logout) + `__Host-` cookies + CSP; role/permission enforcement layer (roles exist, nothing enforces per-action).
- Aggregate blind spot: crossings caused by Patient-only changes where no device/identity event fires (e.g. emergency info added last) — periodic reconciliation job is operator-owned; `reconcile-report.mjs` is the tool.
- Notes are ephemeral (client state, honest "not saved" hint).
- Dynamo aggregate ADD doesn't clamp at zero (mock does); census correction is the fix if ever wrong.

**Future:** queue bulk actions fire N sequential server actions (fine at pilot scale); customer email/mobile/location blank in Ops (not on Profile item); duplicate practices possible (one per onboarding); error monitoring TODO (`error.tsx`).

## 10. FUTURE PATCHES (intentionally deferred, in rough priority)

1. **Slice C — Notes persistence** (Ops-owned NOTE item + server action; replaces the last "mock" hint in the Workspace).
2. **Slice E — queue assignment** (real "Assign to me": in-place dual-projection update — the same-SK Put path) **+ membership read-only facet** in Workspace Summary.
3. Credential automation for practitioners (Cognito admin-create or invite flow; today: manual + optional sub-link + "credentials pending" notice via `prac_` id prefix heuristic).
4. Practice reuse/dedup in onboarding (picker instead of create-always).
5. Support producer source (when Patient gains in-app support submissions) + manual work-item creation UI.
6. Identity explicit reject UI (mirror of the practitioner decision panel).
7. Emergency tap certification / responder-context capture on `/e`; tap-test auto-verification of the fulfilment step.
8. Protected Lives weekly delta (historical snapshots) for the hero trend.
9. Mission Control engine upgrades (briefing/health/alerts from real signals; LLM optional behind unchanged contracts).
10. Practitioner directory `practitionerId` on customer entries (association display).
11. Cleanup: Robyn's duplicate PENDING device (Patient-side); decide Cameron + Michael `…103b2da7` inclusion; delete/mark test profiles on Patient side.

## 11. NEXT SPRINT

**First: execute the pending deployment bundle** (§7 order: Patient → Ops → Lambda → backfill → verification checklist incl. Dr Michael Edwards / Edwards Family Practice). This is operator-executed; the session prepares/verifies.

**Then: Sprint "Department Completion — Slice C: Notes Persistence."** Ops-owned note items (suggested key `PROFILE#<subjectId> / OPSNOTE#<ts>#<noteId>`, Ops-owned like work/aggregate/directory — not mirrored), `NoteRepository` (mock + Dynamo + factory), server action (auth-guarded, audited or timestamped with author name), wire `InternalNotes` to persist + list (works for BOTH workspaces if trivially generalisable — customer first), tests + five gates, pause. No other scope.

## 12. ENGINEERING PRINCIPLES (established and enforced)

1. **One Customer Workspace** — `/customers/[id]` is the only customer view; new record info = a section/tab, never a screen. The Workspace *framework* may host other record types (Practitioner Workspace is sanctioned).
2. **One Work Engine; Work Items are the source of operational truth.** `customerId` = subject id. Deterministic ids (`<subjectId>-identity|card|practitioner`) are the idempotency backbone.
3. **Queues are projections** — configuration of the one generic queue; they never own work; rows deliver into workspaces.
4. **Patient Platform is the source of functional truth; Operations consumes projections** and writes only decisions/operational state that Patient reads back (identity decision, practitioner status+notes, card work) plus Ops-owned items (work index, aggregate, directory, future notes).
5. **No runtime scans, no new GSI without escalation** — listing needs = producer-maintained projections (the directory idiom). Scans allowed ONLY in one-off operator tooling (`scripts/`).
6. **Operational truth over theatre / no fake state** — Ops dispatch never activates a card; Protected only via real activation; unwired actions say "mock"; empty states tell the truth; readiness 85% with an active card is correct data, not a bug.
7. **Fail closed** — production can never silently run mock; unsupported transitions error loudly; unknown users resolve to null.
8. **Pure core + thin wrapper** — branching logic in unit-tested pure `lib/` cores; components/server actions stay thin. Dynamo behaviour proven via injected fake `doc.send` command assertions.
9. **Exhaustive `Record` maps for every enum** — the compiler forces metadata on new values; shared enum VALUES are pinned in `shared-contract.test.ts`.
10. **Cross-product contract changes are deliberate and shipped together** (audit vocabulary Option A pattern: extend both repos, pin both sides, deploy jointly). Never disguise Ops facts as approximate Patient events.
11. **Idempotency everywhere the stream touches** — conditional creates, terminal-status dedupe markers, recompute-from-truth refreshes; replays must never duplicate or re-increment.
12. **Five gates, every slice, no exceptions**; pause for review between slices; vertical slices only; architecture frozen unless explicitly approved; no feature creep; no AI in product paths (deterministic engines behind swappable contracts).
13. **Department Completion philosophy:** a department is done when it feels like a mature department (real surfaces, real data, honest affordances) — not when a feature list is checked. **Administration owns creation; departments own support. ACTIVE is the normal operational state** (management language over unchanged contract values).
    **Practitioner Operating Model (authoritative, CPTO-confirmed 2026-07-03): practitioners NEVER self-register.** Sales → agreement → Administration creates the account + practice and provisions Cognito credentials manually → practitioner uses the portal → Practitioner Operations supports thereafter. `PENDING` is an internal administrative state only; approval mechanics stay in code but are not the V1 journey. Every practitioner feature must first answer *"would EMRID staff perform this, or would a practitioner perform this?"* — frame as management/support/maintenance, never application/approval. No public registration model unless the CPTO explicitly instructs it (full detail: `OPERATOR_HANDOFF.md` §12).
14. **Verify against live data before diagnosing** — read the actual items; several "bugs" were truthful data and several hypotheses were disproven by a single Query.

---

## IMMEDIATE NEXT ACTIONS (for the next session)

1. Read this file, then `OPERATOR_HANDOFF.md` §10–§12 and `JOINT_GO_LIVE_CHECKLIST.md`.
2. Confirm the five gates still pass in both repos (`npm run typecheck && npm run lint && npm run test && npm run build && npm audit`; Node via `export PATH="$HOME/.local/node/bin:$PATH"`; expect Ops 229 / Patient 151 tests).
3. Walk the operator through the **pending deployment bundle** (§7): Patient → Ops → Lambda rebuild (use the exact esbuild recipe) → `backfill-directory.mjs --dry-run` → execute → run the verification checklist (11 customers in directory/search; practitioner roster; Dr Michael Edwards present or onboarded; Robyn + Michael visible in the Identity queue).
4. Natural live win available immediately after deploy: approving **Michael Edwards (`…be8eee75`)** makes Protected Life #2 through the normal path; working **Robyn's** identity + fulfilment makes #3.
5. Begin **Slice C — Notes persistence** (scope pinned in §11). Pause after gates for review, per process.
6. Housekeeping when convenient: revoke temporary IAM grants on `emrid-dev-local` (Scan, InvokeFunction); Robyn's duplicate pending device; test-profile cleanup on the Patient side.
