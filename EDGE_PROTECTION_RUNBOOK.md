# EMRID — Edge Protection Runbook (GH-3)

> Operator-executed. Engineering has verified the applications are compatible with edge enforcement (no IP-dependent logic; all state via cookies; health endpoints return 200 unauthenticated). **No AWS change is performed by engineering.** Michael owns WAF/CloudFront/Route53.

## 1. Endpoint classification (audited 2026-07-06)

### Patient Platform (`emrid`, uat.emrid.co.za / amplifyapp.com)

| Endpoint | Class | Notes |
|---|---|---|
| `/`, `/how-it-works`, `/pricing`, `/contact` | Public | Marketing; contact form has no backend |
| `/register`, `/login` | Public | Server actions proxy to Cognito (`USER_PASSWORD_AUTH`, sign-up, confirm, forgot/reset) |
| `/claim/[token]` | Public | Single-use, email-bound claim tokens; consumed on claim |
| `/e/[deviceToken]` | **Public — life-safety critical** | ~140-bit CSPRNG tokens; PUBLIC_EMERGENCY fields only; force-dynamic; noindex |
| `/api/health` | Public | Secret-free booleans only (GH-5) |
| `/api/client-error` | Public | Telemetry beacon; 2KB cap, field-whitelisted (GH-1) |
| `/app/*` | Authenticated (patient) | Edge cookie gate + server-side JWT verify + grant-based access |
| `/practitioner/*` | Authenticated (practitioner) | Session + `PRACTITIONER#<sub>` record + APPROVED status |

### Operations Platform (`emrid-ops`, main.d3dm6cbwkmq8gr.amplifyapp.com)

| Endpoint | Class | Notes |
|---|---|---|
| `/login` | Public | Staff sign-in; rejects roleless pool users before any cookie exists |
| `/api/health` | Public | Secret-free booleans only; excluded from middleware |
| Everything else incl. `/api/client-error` | Authenticated (staff) | Cookie gate at edge + role-gated session (`isAuthorizedOpsUser`) per request |

There are no other API routes and no internal-only endpoints. Server actions POST to their own page routes (Next.js), so rate rules on POST cover them.

## 2. CloudFront / WAF requirements

Amplify Hosting fronts both apps with CloudFront automatically. Attach **AWS WAF** (Amplify Hosting → Firewall, or a WebACL on the underlying distribution) to **both apps**:

**Managed rule groups (both apps):**
1. `AWSManagedRulesAmazonIpReputationList`
2. `AWSManagedRulesCommonRuleSet` (start in COUNT mode for 48h, then BLOCK — watch for false positives on server-action POST bodies)
3. `AWSManagedRulesKnownBadInputsRuleSet`

**Rate-based rules (per source IP, 5-minute window):**

| App | Scope | Limit | Rationale |
|---|---|---|---|
| Patient | URI starts with `/e/` | 100 | Token brute-force is infeasible (~140-bit) — this bounds DoS/read-cost. Generous: a genuine responder never needs 100 |
| Patient | Method POST (all paths) | 60 | Covers login/register/confirm/forgot server actions above Cognito's own throttling |
| Patient | URI starts with `/claim/` | 30 | Single-use tokens; bounds enumeration |
| Patient | URI = `/api/client-error` | 30 | Public beacon; bounds log spam |
| Ops | Method POST (all paths) | 60 | Staff tool; low genuine volume |
| Ops | URI = `/login` (POST) | 20 | Front-door brute-force bound |

Block action: 429 where supported, else 403. Do NOT rate-limit GET `/api/health` (monitors).

**Logging & monitoring:** enable WAF logging (to CloudWatch Logs or S3); alarm on `BlockedRequests > 50 / 5min` per rule (early attack signal); enable CloudFront standard logs for the Patient app at minimum (the `/e` access record complements the application's `EMERGENCY_PROFILE_VIEWED` audit).

## 3. Application compatibility (engineering-verified)

- No IP-based logic anywhere; WAF blocks cannot break sessions.
- `serverActions.allowedOrigins` already lists the custom domains + `*.amplifyapp.com` — keep WAF from rewriting Host/Origin.
- `/api/health` (both apps) returns 200 unauthenticated for uptime checks behind the same distribution.
- All security headers are set via `amplify.yml` `customHeaders` (GH-2) — no CloudFront function needed. CSP remains intentionally deferred (Risk Register R-12).

## 4. Verification checklist (after WAF attach)

- [ ] `/e/<real-token>` still renders for a normal responder (single request)
- [ ] 101 rapid requests to `/e/x` from one IP → 429/403 on the tail
- [ ] Login on both apps still works (managed rules in BLOCK not eating server actions)
- [ ] `GET /api/health` → 200 on both apps
- [ ] WAF log group receiving entries; blocked-request alarm wired to SNS
