#!/usr/bin/env node
/**
 * EMRID Live Data Reconciliation — Phase 1: READ-ONLY REPORT.
 *
 * Operator diagnostic over the SHARED DynamoDB table: discovers real profiles,
 * emergency profiles, devices, work items, and the Protected-Lives aggregate,
 * then reports per-customer operational state, inconsistencies, and the
 * recommended reconciliation action. Historical customers (registered before
 * EMRID Operations existed) are first-class: missing work items are expected
 * findings, not errors.
 *
 * READ-ONLY GUARANTEE: this script imports and issues ONLY Scan / Query /
 * GetItem. There is no write path in this file. Phase 2 (backfill) is a
 * separate, explicitly-approved step.
 *
 * Usage:
 *   node scripts/reconcile-report.mjs --discover=scan   # full (needs dynamodb:Scan — admin role)
 *   node scripts/reconcile-report.mjs --discover=work   # limited (Query-only creds): finds only
 *                                                       # customers that HAVE work items
 * Env: AWS_PROFILE / role creds, APP_AWS_REGION (default eu-west-1),
 *      DYNAMODB_TABLE_NAME (default emrid-dev-app).
 *
 * Derivation rules deliberately MIRROR the app's pure cores:
 *   - emergency present / contacts  → lib/customers/facets.ts
 *   - protected = identity VERIFIED && device ACTIVE && emergency present
 *                                   → lib/customers/readiness.ts (protectionStatusFromFacets)
 *   - deterministic work ids <id>-identity / <id>-card → lib/work/producer-core.ts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.APP_AWS_REGION ?? "eu-west-1";
const TABLE = process.env.DYNAMODB_TABLE_NAME ?? "emrid-dev-app";
const MODE = (process.argv.find((a) => a.startsWith("--discover=")) ?? "--discover=scan")
  .split("=")[1];

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// Mirror of lib/customers/facets.ts MEDICAL_INFO_KEYS.
const MEDICAL_KEYS = [
  "bloodType", "allergies", "chronicConditions", "medications", "disabilities",
  "emergencyInstructions", "medicalAid", "preferredHospital", "familyDoctor",
];
const WORK_DOMAINS = ["IDENTITY", "FULFILMENT", "READINESS", "SUPPORT", "PRACTITIONER"];
const ACTIVE_WORK = new Set(["OPEN", "IN_PROGRESS", "WAITING", "BLOCKED"]);

/** state: profiles/emergency/devices/work keyed by profileId. */
const state = {
  profiles: new Map(),
  emergency: new Map(),
  devices: new Map(), // profileId -> [{deviceId,status,token,activationCode}]
  work: new Map(),    // profileId -> [{workItemId,workType,status,step}]
  aggregate: null,
};

function noteDevice(profileId, d) {
  if (!profileId) return;
  const list = state.devices.get(profileId) ?? [];
  if (!list.some((x) => x.deviceId === d.deviceId)) list.push(d);
  state.devices.set(profileId, list);
}
function noteWork(customerId, w) {
  if (!customerId) return;
  const list = state.work.get(customerId) ?? [];
  if (!list.some((x) => x.workItemId === w.workItemId)) list.push(w);
  state.work.set(customerId, list);
}
function classify(item) {
  const pk = String(item.PK ?? "");
  const sk = String(item.SK ?? "");
  if (pk.startsWith("PROFILE#") && sk === "PROFILE") state.profiles.set(item.profileId, item);
  else if (pk.startsWith("PROFILE#") && sk === "EMERGENCY") state.emergency.set(item.profileId, item);
  else if (pk.startsWith("DEVICE#") && sk === "DEVICE") noteDevice(item.profileId, item);
  else if (pk.startsWith("PROFILE#") && sk.startsWith("DEVICE#")) noteDevice(item.profileId, item);
  else if (pk.startsWith("WORK#")) noteWork(item.customerId, item);
  else if (pk.startsWith("PROFILE#") && sk.startsWith("WORK#")) noteWork(item.customerId, item);
}

async function discoverByScan() {
  let ExclusiveStartKey;
  do {
    const page = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    for (const item of page.Items ?? []) classify(item);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function discoverByWork() {
  const ids = new Set();
  for (const d of WORK_DOMAINS) {
    const res = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `WORK#${d}` },
    }));
    for (const item of res.Items ?? []) {
      classify(item);
      if (item.customerId) ids.add(item.customerId);
    }
  }
  for (const id of ids) {
    let ExclusiveStartKey;
    do {
      const page = await doc.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `PROFILE#${id}` },
        ExclusiveStartKey,
      }));
      for (const item of page.Items ?? []) classify(item);
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
}

function analyseProfile(p) {
  const id = p.profileId;
  const em = state.emergency.get(id);
  const emergencyPresent = Boolean(em && MEDICAL_KEYS.some((k) => em[k] !== undefined));
  const contacts = em?.emergencyContacts?.value?.length ?? 0;
  const devices = state.devices.get(id) ?? [];
  const active = devices.filter((d) => d.status === "ACTIVE");
  const pending = devices.filter((d) => d.status === "PENDING");
  const work = state.work.get(id) ?? [];
  const idWork = work.find((w) => w.workItemId === `${id}-identity`);
  const cardWork = work.find((w) => w.workItemId === `${id}-card`);
  const identityVerified = p.identityVerificationStatus === "VERIFIED";
  const identityPending = p.identityVerificationStatus === "PENDING";

  // Expectations (the reconciliation rules).
  const shouldVerifyIdentity = identityPending; // an active review is owed
  const missingIdentityWork = shouldVerifyIdentity && !(idWork && ACTIVE_WORK.has(idWork.status));
  const shouldIssueCard = pending.length > 0; // a card is in fulfilment
  const missingCardWork = shouldIssueCard && !cardWork;
  const shouldCardBeDone = active.length > 0 && Boolean(cardWork);
  const staleCardWork = shouldCardBeDone && ACTIVE_WORK.has(cardWork.status);
  const shouldBeProtected = identityVerified && active.length > 0 && emergencyPresent;
  const verifiedOutOfBand = identityVerified && !idWork;

  const actions = [];
  if (missingIdentityWork) actions.push("CREATE VERIFY_IDENTITY (synthetic identity event)");
  if (missingCardWork) actions.push("CREATE ISSUE_CARD (synthetic device-pending event)");
  if (staleCardWork) actions.push("COMPLETE ISSUE_CARD (synthetic activation event)");
  if (active.length > 0 && !cardWork)
    actions.push("No card-work backfill (history not fabricated) — aggregate census covers protection");
  if (verifiedOutOfBand) actions.push("Identity verified out-of-band (historical) — no work backfill");
  if (actions.length === 0) actions.push("None — consistent");

  const consistent = !missingIdentityWork && !missingCardWork && !staleCardWork;
  return {
    id, first: p.firstName, last: p.lastName, emrid: p.emrid,
    idStatus: p.identityVerificationStatus ?? "UNVERIFIED",
    level: p.verificationLevel,
    emergencyPresent, contacts,
    deviceCount: devices.length, activeCount: active.length, pendingCount: pending.length,
    tokenPresent: devices.some((d) => Boolean(d.token)),
    work: work.map((w) => `${w.workType}:${w.status}:${w.step ?? 0}`).join(" | ") || "—",
    shouldVerifyIdentity, missingIdentityWork, shouldIssueCard, missingCardWork,
    shouldCardBeDone, staleCardWork, shouldBeProtected, consistent, actions,
  };
}

async function main() {
  console.log(`# EMRID Reconciliation — Phase 1 (READ-ONLY) — mode=${MODE} table=${TABLE}`);
  if (MODE === "scan") await discoverByScan();
  else await discoverByWork();

  try {
    const agg = await doc.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "AGGREGATE#PROTECTED_LIVES", SK: "CURRENT" },
    }));
    state.aggregate = agg.Item ?? null;
  } catch { state.aggregate = null; }

  const rows = [...state.profiles.values()].map(analyseProfile);

  // Per-profile table (compact) + actions.
  const header = [
    "profileId", "name", "emrid", "idStatus", "emerg", "contacts",
    "devices(A/P)", "workItems", "protected?", "consistent?",
  ];
  console.log("\n| " + header.join(" | ") + " |");
  console.log("|" + header.map(() => "---").join("|") + "|");
  for (const r of rows) {
    console.log("| " + [
      r.id, `${r.first ?? ""} ${r.last ?? ""}`.trim(), r.emrid ?? "—",
      r.idStatus, r.emergencyPresent ? "yes" : "no", r.contacts,
      `${r.deviceCount}(${r.activeCount}/${r.pendingCount})`, r.work,
      r.shouldBeProtected ? "YES" : "no", r.consistent ? "yes" : "NO",
    ].join(" | ") + " |");
  }
  console.log("\n## Recommended actions");
  for (const r of rows) console.log(`- ${r.id} (${r.first ?? "?"}): ${r.actions.join("; ")}`);

  // Summary.
  const protectedExpected = rows.filter((r) => r.shouldBeProtected).length;
  const inProgress = rows.filter((r) => !r.shouldBeProtected &&
    (r.idStatus === "VERIFIED" || r.idStatus === "PENDING" || r.deviceCount > 0 || r.emergencyPresent)).length;
  const missing = rows.filter((r) => r.missingIdentityWork || r.missingCardWork).length;
  const stale = rows.filter((r) => r.staleCardWork).length;
  const aggActual = state.aggregate ? Number(state.aggregate.protectedCount ?? 0) : "ABSENT";
  console.log("\n## Summary");
  console.log(`- total profiles:          ${rows.length}${MODE === "work" ? "  (LIMITED discovery — profiles without work items are NOT visible in this mode)" : ""}`);
  console.log(`- protected (expected):    ${protectedExpected}`);
  console.log(`- in progress:             ${inProgress}`);
  console.log(`- profiles missing work:   ${missing}`);
  console.log(`- profiles with stale work:${stale}`);
  console.log(`- aggregate expected vs actual: ${protectedExpected} vs ${aggActual}${state.aggregate ? ` (inProgress ${state.aggregate.inProgressCount}, v${state.aggregate.version})` : ""}`);
  console.log("\nRead-only report complete. No data was modified.");
}

main().catch((err) => { console.error("FAILED:", err?.message ?? err); process.exit(1); });
