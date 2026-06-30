import type { ProfileRepository, WorkItemRepository } from "@/lib/data/types";
import {
  buildProducedWorkItem,
  producedWorkItemId,
  workIntentForChange,
  type StreamChange,
} from "@/lib/work/producer-core";
import { parseStreamRecord } from "@/lib/work/stream";
import { nowIso } from "@/lib/data/ids";

/**
 * Work-Item producer — the handler seam. Given injected repositories (so it is
 * unit-testable without AWS, like `executeTransition`), it turns a shared-table
 * change into a Work Item: decide the intent, resolve the customer's display
 * name, and create the item idempotently.
 *
 * In production this is invoked by an operator-deployed DynamoDB Stream → Lambda
 * (see OPERATOR_HANDOFF). This module owns the LOGIC; the Lambda entry point is
 * a thin adapter the operator wires to the real (flag-selected) repositories.
 *
 * Idempotency is twofold: a pre-existence check (so a replay is a clean skip
 * with a clear result) AND the repository's idempotent `create` (the atomic
 * backstop against a concurrent double-delivery).
 */
export type ProducerDeps = {
  workRepo: WorkItemRepository;
  profileRepo: ProfileRepository;
};

export type ProduceResult = {
  /** True only when this call actually wrote a new Work Item. */
  created: boolean;
  workItemId?: string;
  /** Why nothing was created: "no-op" (change irrelevant) or "exists" (replay). */
  reason?: "no-op" | "exists";
};

export async function produceFromChange(
  deps: ProducerDeps,
  change: StreamChange,
  now: string = nowIso(),
): Promise<ProduceResult> {
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
