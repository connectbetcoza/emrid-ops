# EMRID — Go-Live Risk Register (GH-7)

> POPIA / security / operational register for the controlled practitioner pilot. Owner: CPTO. Reviewed each release. Status as of the GO-LIVE HARDENING sprint (2026-07-06). Likelihood/Impact: L/M/H.

## A. Pilot BLOCKERS (must be closed before pilot start)

| ID | Risk | Impact | Likelihood | Current mitigation | Required mitigation | Target |
|---|---|---|---|---|---|---|
| R-1 | Ops front-door fix (`ae84b59`) not yet verified live — any pool user may still access Ops in the deployed build | H (full operational + customer data exposure) | M until verified | Fix on `main`; tests pin the gate | Deploy; verify a no-group login is rejected at Ops `/login`; verify `/api/health` shows the new build | Pre-pilot (deploy day) |
| R-2 | No edge rate limiting on public surfaces (`/e`, auth, `/claim`, beacon) | M (DoS, read-cost, log spam; disclosure already infeasible via ~140-bit tokens) | M | Strong token entropy; Cognito throttling; size-capped beacon | Operator applies `EDGE_PROTECTION_RUNBOOK.md` (WAF managed + rate rules) and verifies | Pre-pilot |
| R-3 | No alerting on errors — faults invisible | H (silent outage in a life-safety product) | H without action | GH-1 seam ships structured `emrid:error` / `emrid-ops:error` records to CloudWatch via stderr | Operator creates metric filters + alarms + SNS (OPERATOR_HANDOFF §13) and test-fires one alarm | Pre-pilot |

## B. Pilot RISKS (accepted for a controlled pilot; tracked, with conditions)

| ID | Risk | Impact | Likelihood | Current mitigation | Required mitigation | Target |
|---|---|---|---|---|---|---|
| R-4 | Plaintext SA ID numbers in the isolated `IDENTITY` item (POPIA special personal information) | H at scale | L (requires table read access) | Isolated item; masked everywhere; never logged/serialised; KMS-at-rest; least-privilege IAM | App-level encryption or tokenisation of `idNumber` | **Before any real-identity scale-up; hard gate for GA** |
| R-5 | Patient cannot view/revoke practitioner access grants (POPIA participation rights) | M | M | Grants are patient-created (code/claim); practitioner can self-revoke; Ops can see grants and intervene manually | Patient-side "who has access + revoke" surface | First post-pilot slice |
| R-6 | No right-to-erasure (hard-delete) path — soft-delete only | M | L in pilot (consented participants) | `DELETED` status filters all reads; pilot consent covers retention | Documented erasure procedure + purge tooling | Before GA |
| R-7 | Device replace / lost-card flows absent (`REPLACED` status unused) | M (support burden) | M | Suspend + revoke + re-issue works today; Ops Customer Support dept live for queries | Replacement slice (patient or ops-assisted) | Post-pilot |
| R-8 | No per-action RBAC inside Ops (any staff role can do everything) | M | L (tiny vetted staff) | Front-door role gate (staff only); every action audited with actor id | Permission layer keyed on `OpsRole` | Post-pilot |
| R-9 | Guardian/owner role granularity unenforced on Patient (`TODO(sprint-auth)`) | M | L (no guardians in pilot cohort) | Grant-holders only; all mutations audited | Role-aware ACL in profile actions | Post-pilot |
| R-10 | Aggregate blind spot: protection crossings via Patient-only events (e.g. emergency info added last) | L (reporting only) | M | `reconcile-report.mjs` operator tool; producer covers identity/card paths | Scheduled reconciliation cadence (weekly, operator) | Standing task from pilot start |

## C. FUTURE improvements (not pilot-relevant)

| ID | Risk | Required mitigation | Target |
|---|---|---|---|
| R-11 | Shared-contract mirror drift undetectable from the Patient side | Shared package + CI alignment check | Post-pilot hardening |
| R-12 | CSP intentionally deferred (both apps); `__Host-` cookie prefix not used | Tested CSP rollout; cookie-prefix migration | Post-pilot hardening |
| R-13 | Refresh-token rotation absent (~1h forced re-login; unrotated refresh token at rest in cookie until sign-out) | Rotation + shorter refresh validity | Post-pilot |
| R-14 | Production data in `emrid-dev-app` / `emrid-dev-documents` naming | Rename/migrate or document as permanent alias | Ops housekeeping |
| R-15 | Zero component / middleware / server-action test coverage | Component tests for queue/workspace frameworks; action tests | Continuous |
| R-16 | Practice records duplicated per onboarding (no reuse picker) | Practice picker/dedup in onboarding | Post-pilot |
| R-17 | Queue bulk actions run N sequential server actions | Batch transition action if volume grows | When volume warrants |
| R-18 | Cognito user pool has no backup/export | Documented user re-provisioning procedure (pilot cohort is small); consider Cognito user export tooling | Before GA |

## POPIA position (summary)

Processing basis for the pilot: **explicit consent** of a small participant cohort; purpose-limited (emergency medical disclosure + operational verification). Minimisation is enforced in code (public route disclosing only `PUBLIC_EMERGENCY` fields; audit metadata carries ids only; masked ID display). Security safeguards: httpOnly/Secure sessions, role-gated staff access, append-only audit, least-privilege IAM, KMS-at-rest. Open POPIA items: R-4 (special-information encryption), R-5 (data-subject participation), R-6 (erasure). These are register-tracked with owners and targets; R-4 is the hard gate before real-identity scale.
