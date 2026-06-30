import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkType } from "@/lib/work/work-type";
import { workTypeMeta } from "@/lib/work/work-type";
import { dueDateFor } from "@/lib/work/rules";
import { DEVICE_SK, PROFILE_SK } from "@/lib/data/aws/keys";

/**
 * Work-Item producer — PURE core. Turns a normalized shared-table change into
 * the Work Item the Patient Platform's write should create, reusing the existing
 * WorkType / WorkDomain / priority rules (no new work concepts). The Stream
 * parsing (`stream.ts`) and the repository IO (`producer.ts`) wrap this; the
 * decision logic lives here so it is verified without AWS.
 *
 * Scope (the only two safely-derivable signals):
 *   • a Profile reaching identity status PENDING  → VERIFY_IDENTITY
 *   • a Device reaching status PENDING (card requested) → ISSUE_CARD
 *
 * Idempotency is by DETERMINISTIC id: the same customer + work kind always maps
 * to the same `workItemId` (matching the readiness generator's `<id>-<factor>`
 * convention), so a replayed event targets the same item and the idempotent
 * `create` is a no-op rather than a duplicate.
 */

/** A normalized DynamoDB Stream change (post-unmarshall). */
export type StreamChange = {
  eventName: "INSERT" | "MODIFY" | "REMOVE";
  keys: { PK: string; SK: string };
  newImage: Record<string, unknown> | null;
  oldImage: Record<string, unknown> | null;
};

/** What the producer decides to create. */
export type WorkIntent = {
  workType: Extract<WorkType, "VERIFY_IDENTITY" | "ISSUE_CARD">;
  customerId: string;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** The factor suffix that makes the id match the readiness generator's ids. */
const ID_SUFFIX: Record<WorkIntent["workType"], string> = {
  VERIFY_IDENTITY: "identity",
  ISSUE_CARD: "card",
};

/** Deterministic Work Item id for an intent (the idempotency key). */
export function producedWorkItemId(intent: WorkIntent): string {
  return `${intent.customerId}-${ID_SUFFIX[intent.workType]}`;
}

/**
 * Decide which Work Item (if any) a change warrants. Fires on the transition
 * INTO the triggering status (a fresh INSERT, or a MODIFY that newly reaches
 * PENDING) so steady-state re-emits don't re-trigger; true replay-safety is
 * still the deterministic id + idempotent create, not this guard.
 */
export function workIntentForChange(change: StreamChange): WorkIntent | null {
  const img = change.newImage;
  if (!img) return null; // REMOVE / empty image → nothing to create

  if (change.keys.SK === PROFILE_SK) {
    const status = str(img.identityVerificationStatus);
    const previous = str(change.oldImage?.identityVerificationStatus);
    const customerId = str(img.profileId);
    if (status === "PENDING" && previous !== "PENDING" && customerId) {
      return { workType: "VERIFY_IDENTITY", customerId };
    }
    return null;
  }

  if (change.keys.SK === DEVICE_SK) {
    const status = str(img.status);
    const previous = str(change.oldImage?.status);
    const customerId = str(img.profileId);
    if (status === "PENDING" && previous !== "PENDING" && customerId) {
      return { workType: "ISSUE_CARD", customerId };
    }
    return null;
  }

  return null;
}

/**
 * Build the Work Item record for an intent. OPEN, default priority (the rules'
 * base — unprotected-escalation needs full customer state and stays a generator
 * concern), due date derived from priority, display fields from the type meta.
 * `now` and `subjectName` are injected so this stays pure.
 */
export function buildProducedWorkItem(
  intent: WorkIntent,
  ctx: { subjectName: string; now: string },
): WorkItemRecord {
  const meta = workTypeMeta(intent.workType);
  const priority = meta.defaultPriority;
  return {
    workItemId: producedWorkItemId(intent),
    customerId: intent.customerId,
    workType: intent.workType,
    workDomain: meta.domain,
    status: "OPEN",
    priority,
    step: 0,
    assignment: { assigneeName: null },
    source: "READINESS_GAP",
    title: meta.label,
    subjectName: ctx.subjectName,
    nextAction: meta.nextAction,
    dueAt: dueDateFor(ctx.now, priority),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}
