import type {
  AggregateRepository,
  AuditRepository,
  DeviceRepository,
  DirectoryRepository,
  EmergencyProfileRepository,
  PractitionerRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import {
  buildProducedWorkItem,
  cardCompletionForChange,
  deviceCrossingCandidate,
  directoryRefreshTarget,
  practitionerRefreshTarget,
  producedWorkItemId,
  workIntentForChange,
  type CardCompletion,
  type StreamChange,
} from "@/lib/work/producer-core";
import { parseStreamRecord } from "@/lib/work/stream";
import { buildDirectoryEntry } from "@/lib/customers/directory-core";
import { protectionStatusFromFacets } from "@/lib/customers/readiness";
import { cardActiveFacet } from "@/lib/data/entities";
import { hasEmergencyInfo } from "@/lib/customers/facets";
import {
  crossesProtectedBoundary,
  protectedLivesDelta,
} from "@/lib/protection/aggregate";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import { nowIso } from "@/lib/data/ids";

/**
 * Work-Item producer — the handler seam. Given injected repositories (so it is
 * unit-testable without AWS, like `executeTransition`), it reconciles Ops
 * operational state to shared-table changes:
 *
 *   • an identity submission / card request CREATES the matching Work Item;
 *   • the CUSTOMER's real card activation (device → ACTIVE) COMPLETES the
 *     ISSUE_CARD Work Item and moves the Protected-Lives aggregate — the one
 *     legitimate activation crossing (Ops dispatch never activates).
 *
 * In production this is invoked by an operator-deployed DynamoDB Stream → Lambda
 * (see OPERATOR_HANDOFF). This module owns the LOGIC; the Lambda entry point is
 * a thin adapter the operator wires to the real (flag-selected) repositories.
 *
 * Idempotency: deterministic work-item ids; creation uses the idempotent
 * `create`; completion uses the work item's own terminal status as the durable
 * replay marker — a replayed activation event finds the item DONE and no-ops,
 * so the aggregate can never re-increment.
 */
export type ProducerDeps = {
  workRepo: WorkItemRepository;
  profileRepo: ProfileRepository;
  deviceRepo: DeviceRepository;
  emergencyRepo: EmergencyProfileRepository;
  aggregateRepo: AggregateRepository;
  auditRepo: AuditRepository;
  directoryRepo: DirectoryRepository;
  practitionerRepo: PractitionerRepository;
};

export type ProduceResult = {
  /** True only when this call actually wrote a new Work Item. */
  created: boolean;
  /** True only when this call completed card work on a real activation. */
  completed?: boolean;
  workItemId?: string;
  /**
   * Why nothing changed: "no-op" (change irrelevant), "exists" (creation
   * replay), "already-done" (activation replay), "missing" (activation with no
   * card Work Item to complete).
   */
  reason?: "no-op" | "exists" | "already-done" | "missing";
};

/**
 * Complete the customer's ISSUE_CARD work on their real activation, and apply
 * the Protected-boundary crossing exactly once. The work item's DONE status is
 * the idempotency marker: transition first, then aggregate + audit.
 */
async function completeCardWork(
  deps: ProducerDeps,
  completion: CardCompletion,
): Promise<ProduceResult> {
  // Match by TYPE + non-terminal STATUS, not by id: card work may carry the
  // legacy `<customerId>-card` id or a device-scoped `<deviceId>-card` id
  // (replacements). At most one card flow is active per customer at a time;
  // absence of a non-terminal item is the replay/already-reconciled marker.
  const items = await deps.workRepo.listForCustomer(completion.customerId);
  const cardItems = items.filter((w) => w.workType === "ISSUE_CARD");
  const current = cardItems.find(
    (w) => w.status !== "DONE" && w.status !== "CANCELLED",
  );
  if (!current) {
    const workItemId =
      cardItems[0]?.workItemId ??
      producedWorkItemId({
        workType: "ISSUE_CARD",
        customerId: completion.customerId,
        deviceId: completion.deviceId,
      });
    return {
      created: false,
      completed: false,
      workItemId,
      reason: cardItems.length > 0 ? "already-done" : "missing",
    };
  }
  const workItemId = current.workItemId;

  // 1. Complete the work item (dual projection rewrite) — the durable marker.
  await deps.workRepo.transition(current, { toStatus: "DONE" });

  // 2. NOTE (2b ownership model): the Protected-boundary crossing is NOT
  //    applied here — applyDeviceCrossing owns EVERY device-driven crossing
  //    (both directions) on the same stream event, deduped via the directory
  //    entry. This function only completes the work item and audits.

  // 3. Audit the system-observed completion (ids only; the activation itself is
  //    the Patient Platform's own audit fact).
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.WORK_TRANSITION,
    actorType: "SYSTEM",
    targetType: "PROFILE",
    targetId: completion.customerId,
    metadata: { workItemId, toStatus: "DONE", trigger: "CARD_ACTIVATED" },
  });

  return { created: false, completed: true, workItemId };
}

/**
 * Apply the Protected-boundary crossing a device status change implies —
 * the SINGLE owner of device-driven aggregate movement, both directions
 * (2b): PENDING→ACTIVE, SUSPENDED→ACTIVE, ACTIVE→SUSPENDED, ACTIVE→REVOKED,
 * whether the mutation came from the Patient app or an Ops assisted action.
 *
 * BEFORE comes from the customer's directory entry (producer-maintained and
 * refreshed AFTER this runs), AFTER from current truth. Replay-safe by
 * construction: a redelivered event finds the directory already reflecting
 * the new state, so before === after and the aggregate never moves twice.
 * Multi-device safety falls out of truth-based facets: any other ACTIVE
 * device keeps the customer PROTECTED, so no delta.
 */
export async function applyDeviceCrossing(
  deps: ProducerDeps,
  customerId: string,
): Promise<void> {
  const entry = await deps.directoryRepo.getEntry(customerId);
  // Pre-backfill customers have no entry — the backfill script guarantees
  // entries for all real profiles; without a "before" record a delta cannot
  // be applied safely, so skip (reconcile-report remains the safety net).
  if (!entry) return;
  const before = entry.protectionStatus;

  const [profile, emergency, devices] = await Promise.all([
    deps.profileRepo.getProfile(customerId),
    deps.emergencyRepo.getEmergencyProfile(customerId),
    deps.deviceRepo.listForCustomer(customerId),
  ]);
  if (!profile) return;
  const after = protectionStatusFromFacets({
    identityVerified: profile.identityVerificationStatus === "VERIFIED",
    // Shared facet — see cardActiveFacet. The "before" here comes from the
    // stored directory entry, which computes cardActive the same way; if the
    // two ever diverge the Protected-Lives delta ratchets, because each change
    // re-emits an increment that the next refresh silently reverses.
    cardActive: cardActiveFacet(devices),
    emergencyPresent: hasEmergencyInfo(emergency),
  });

  const delta = protectedLivesDelta(before, after);
  if (crossesProtectedBoundary(delta)) {
    await deps.aggregateRepo.adjustProtectedLives(delta);
  }
}

/**
 * Recompute one customer's Directory entry from source-of-truth reads and
 * upsert it (last writer wins). Recompute-from-truth ⇒ replays rewrite the
 * identical entry. A missing profile is a clean skip (e.g. an event for an
 * entity Ops cannot resolve yet).
 */
export async function refreshDirectoryEntry(
  deps: ProducerDeps,
  profileId: string,
  now: string,
): Promise<boolean> {
  const [profile, emergency, devices, workRecords, auditEvents] =
    await Promise.all([
      deps.profileRepo.getProfile(profileId),
      deps.emergencyRepo.getEmergencyProfile(profileId),
      deps.deviceRepo.listForCustomer(profileId),
      deps.workRepo.listForCustomer(profileId),
      deps.auditRepo.listForProfile(profileId),
    ]);
  if (!profile) return false;

  await deps.directoryRepo.upsertEntry(
    buildDirectoryEntry({
      profile,
      emergency,
      devices,
      workRecords,
      auditEvents,
      now,
    }),
  );
  return true;
}

/**
 * Recompute one practitioner's Directory entry from source-of-truth reads and
 * upsert it (same recompute-from-truth idiom as customer entries).
 */
export async function refreshPractitionerDirectoryEntry(
  deps: ProducerDeps,
  practitionerId: string,
  now: string,
): Promise<boolean> {
  const practitioner = await deps.practitionerRepo.getPractitioner(practitionerId);
  if (!practitioner) {
    // Recompute-from-truth includes absence: a practitioner record that no
    // longer exists under this id (re-keyed by a login link) must not linger
    // in the roster. Idempotent — replays delete a missing entry harmlessly.
    await deps.directoryRepo.removePractitionerEntry(practitionerId);
    return false;
  }
  const practice = await deps.practitionerRepo.getPractice(practitioner.practiceId);
  await deps.directoryRepo.upsertPractitionerEntry({
    practitionerId: practitioner.practitionerId,
    fullName: practitioner.fullName,
    email: practitioner.email,
    practiceId: practitioner.practiceId,
    practiceName: practice?.name,
    status: practitioner.status,
    registeredAt: practitioner.createdAt,
    updatedAt: now,
  });
  return true;
}

/** The work-item action (creation/completion) a change implies, if any. */
async function applyWorkAction(
  deps: ProducerDeps,
  change: StreamChange,
  now: string,
): Promise<ProduceResult> {
  // A real activation completes card work (disjoint from creation: a device
  // reaching ACTIVE is never also a device/profile reaching PENDING).
  const completion = cardCompletionForChange(change);
  if (completion) return completeCardWork(deps, completion);

  const intent = workIntentForChange(change);
  if (!intent) return { created: false, reason: "no-op" };

  const workItemId = producedWorkItemId(intent);

  // Idempotency gate: a Work Item for this customer + kind already exists
  // (replay, or already generated) → skip without clobbering its progress.
  const existing = await deps.workRepo.listForCustomer(intent.customerId);
  if (existing.some((w) => w.workItemId === workItemId)) {
    return { created: false, workItemId, reason: "exists" };
  }

  // Resolve the display name: practitioner intents carry it on the stream
  // image; customer intents resolve via the profile (a single point lookup,
  // no scan); fall back to the id if neither is available.
  let subjectName = intent.subjectName;
  if (!subjectName) {
    const profile = await deps.profileRepo.getProfile(intent.customerId);
    subjectName = profile
      ? `${profile.firstName} ${profile.lastName}`.trim()
      : intent.customerId;
  }

  const record = buildProducedWorkItem(intent, { subjectName, now });
  await deps.workRepo.create(record); // idempotent at the repo level too
  return { created: true, workItemId };
}

export async function produceFromChange(
  deps: ProducerDeps,
  change: StreamChange,
  now: string = nowIso(),
): Promise<ProduceResult> {
  const result = await applyWorkAction(deps, change, now);

  // Keep the Customer Directory projection fresh for ANY profile-linked change
  // (profile, emergency, device, work, audit) — AFTER the work action so the
  // entry reflects it. Runs even for "no-op" work changes (e.g. an emergency
  // update changes readiness without implying work).
  // Device-driven Protected-boundary crossings — BEFORE the directory
  // refresh, which persists the new protection status as the next "before".
  const crossingCustomer = deviceCrossingCandidate(change);
  if (crossingCustomer) {
    await applyDeviceCrossing(deps, crossingCustomer);
  }

  const refreshTarget = directoryRefreshTarget(change);
  if (refreshTarget) {
    await refreshDirectoryEntry(deps, refreshTarget, now);
  }
  const practitionerTarget = practitionerRefreshTarget(change);
  if (practitionerTarget) {
    await refreshPractitionerDirectoryEntry(deps, practitionerTarget, now);
  }

  return result;
}

/**
 * Process a batch of raw DynamoDB Stream records. Malformed records are skipped
 * (parsed to null) rather than failing the batch. Returns one result per
 * parseable record, in order.
 */
export async function produceFromStreamRecords(
  deps: ProducerDeps,
  records: unknown[],
  now: string = nowIso(),
): Promise<ProduceResult[]> {
  const results: ProduceResult[] = [];
  for (const raw of records) {
    const change = parseStreamRecord(raw);
    if (!change) continue;
    results.push(await produceFromChange(deps, change, now));
  }
  return results;
}
