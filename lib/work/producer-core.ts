import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkType } from "@/lib/work/work-type";
import { workTypeMeta } from "@/lib/work/work-type";
import { dueDateFor } from "@/lib/work/rules";
import { DEVICE_SK, PRACTITIONER_SK, PROFILE_SK } from "@/lib/data/aws/keys";

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
  workType: Extract<
    WorkType,
    "VERIFY_IDENTITY" | "ISSUE_CARD" | "APPROVE_PRACTITIONER"
  >;
  /** The SUBJECT id the work is indexed under (customer or practitioner). */
  customerId: string;
  /** Subject display name when the stream image carries it (practitioners). */
  subjectName?: string;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** The factor suffix that makes the id match the readiness generator's ids. */
const ID_SUFFIX: Record<WorkIntent["workType"], string> = {
  VERIFY_IDENTITY: "identity",
  ISSUE_CARD: "card",
  APPROVE_PRACTITIONER: "practitioner",
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

  if (change.keys.SK === PRACTITIONER_SK) {
    // An INTERNALLY-CREATED practitioner record reaching PENDING owes a
    // review (V1: no public self-registration — these records are admin
    // writes). The subject is the PRACTITIONER (indexed under their id); the
    // display name comes straight from the image (practitioners have no
    // Profile item to resolve against).
    const status = str(img.status);
    const previous = str(change.oldImage?.status);
    const practitionerId = str(img.practitionerId);
    if (status === "PENDING" && previous !== "PENDING" && practitionerId) {
      return {
        workType: "APPROVE_PRACTITIONER",
        customerId: practitionerId,
        subjectName: str(img.fullName),
      };
    }
    return null;
  }

  return null;
}

/** A device activation the producer must reconcile operational state to. */
export type CardCompletion = {
  customerId: string;
  /** The device that was activated (to exclude it from "already active" checks). */
  deviceId: string;
};

/**
 * Detect the CUSTOMER's real card activation: a Device item reaching ACTIVE
 * from a non-ACTIVE state (the Patient Platform's activation write). This is
 * the only legitimate trigger for completing ISSUE_CARD work and crossing the
 * Protected boundary — Ops dispatch never activates (operational truth).
 */
export function cardCompletionForChange(
  change: StreamChange,
): CardCompletion | null {
  if (change.keys.SK !== DEVICE_SK) return null;
  const img = change.newImage;
  if (!img) return null;
  const status = str(img.status);
  const previous = str(change.oldImage?.status);
  const customerId = str(img.profileId);
  const deviceId = str(img.deviceId);
  if (status === "ACTIVE" && previous !== "ACTIVE" && customerId && deviceId) {
    return { customerId, deviceId };
  }
  return null;
}

/**
 * Which customer's Directory entry a change makes stale (null when none).
 * Covers every profile-linked item the shared table carries: the profile
 * itself, its emergency data, devices (canonical item), work items (either
 * projection), and audit events (for last-activity). DIRECTORY items themselves
 * are explicitly ignored — the directory upsert emits its own stream event and
 * must never re-trigger a refresh (self-loop guard). Refreshes are
 * recompute-from-truth, so double-firing (e.g. both work projections) is
 * harmless, not duplicated state.
 */
export function directoryRefreshTarget(change: StreamChange): string | null {
  const { PK, SK } = change.keys;
  if (PK === "DIRECTORY") return null; // self-loop guard
  const img = change.newImage ?? change.oldImage;
  if (!img) return null;

  if (PK.startsWith("PROFILE#")) {
    // PROFILE / EMERGENCY / DEVICE#<id> / WORK#<...> items in the profile
    // partition all describe one customer.
    if (
      SK === PROFILE_SK ||
      SK === "EMERGENCY" ||
      SK.startsWith("DEVICE#") ||
      SK.startsWith("WORK#")
    ) {
      return PK.slice("PROFILE#".length) || null;
    }
    return null;
  }
  if (SK === DEVICE_SK) return str(img.profileId) ?? null;
  // Practitioner items refresh the PRACTITIONER directory (handled separately).
  if (PK.startsWith("WORK#")) return str(img.customerId) ?? null;
  if (PK.startsWith("AUDIT#")) {
    if (str(img.targetType) === "PROFILE") return str(img.targetId) ?? null;
    const meta = img.metadata;
    const fromMeta =
      meta && typeof meta === "object"
        ? (meta as Record<string, unknown>).profileId
        : undefined;
    return typeof fromMeta === "string" ? fromMeta : null;
  }
  return null;
}

/** Which practitioner's directory entry a change makes stale (null when none). */
export function practitionerRefreshTarget(change: StreamChange): string | null {
  if (change.keys.PK === "DIRECTORY") return null; // self-loop guard
  if (change.keys.SK !== PRACTITIONER_SK) return null;
  const img = change.newImage ?? change.oldImage;
  return (img && str(img.practitionerId)) || null;
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
