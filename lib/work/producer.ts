import type {
  AggregateRepository,
  AuditRepository,
  DeviceRepository,
  EmergencyProfileRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import {
  buildProducedWorkItem,
  cardCompletionForChange,
  producedWorkItemId,
  workIntentForChange,
  type CardCompletion,
  type StreamChange,
} from "@/lib/work/producer-core";
import { parseStreamRecord } from "@/lib/work/stream";
import { protectionStatusFromFacets } from "@/lib/customers/readiness";
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
  const workItemId = producedWorkItemId({
    workType: "ISSUE_CARD",
    customerId: completion.customerId,
  });

  const items = await deps.workRepo.listForCustomer(completion.customerId);
  const current = items.find((w) => w.workItemId === workItemId);
  if (!current) {
    return { created: false, completed: false, workItemId, reason: "missing" };
  }
  if (current.status === "DONE" || current.status === "CANCELLED") {
    // Replay (or already reconciled) — the terminal status is the dedupe marker.
    return { created: false, completed: false, workItemId, reason: "already-done" };
  }

  // 1. Complete the work item (dual projection rewrite) — the durable marker.
  await deps.workRepo.transition(current, { toStatus: "DONE" });

  // 2. Protected-boundary crossing, exactly once. The card facet flipped
  //    false → true UNLESS another device was already ACTIVE.
  const [profile, emergency, devices] = await Promise.all([
    deps.profileRepo.getProfile(completion.customerId),
    deps.emergencyRepo.getEmergencyProfile(completion.customerId),
    deps.deviceRepo.listForCustomer(completion.customerId),
  ]);
  const identityVerified = profile?.identityVerificationStatus === "VERIFIED";
  const emergencyPresent = hasEmergencyInfo(emergency);
  const otherCardActive = devices.some(
    (d) => d.deviceId !== completion.deviceId && d.status === "ACTIVE",
  );
  const before = protectionStatusFromFacets({
    identityVerified,
    cardActive: otherCardActive,
    emergencyPresent,
  });
  const after = protectionStatusFromFacets({
    identityVerified,
    cardActive: true,
    emergencyPresent,
  });
  const delta = protectedLivesDelta(before, after);
  if (crossesProtectedBoundary(delta)) {
    await deps.aggregateRepo.adjustProtectedLives(delta);
  }

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

export async function produceFromChange(
  deps: ProducerDeps,
  change: StreamChange,
  now: string = nowIso(),
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

  // Resolve the display name from the profile (a single point lookup, no scan);
  // fall back to the id if the profile isn't readable yet.
  const profile = await deps.profileRepo.getProfile(intent.customerId);
  const subjectName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : intent.customerId;

  const record = buildProducedWorkItem(intent, { subjectName, now });
  await deps.workRepo.create(record); // idempotent at the repo level too
  return { created: true, workItemId };
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
