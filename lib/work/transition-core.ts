import type { WorkType } from "@/lib/work/work-type";
import type { WorkStatus } from "@/lib/work/status";

/**
 * Pure transition-planning core. Given a work item's type and the status it is
 * moving to, decide which shared-state write (if any) the transition implies.
 * Pure + unit-tested; the server action (`server-actions.ts`) executes the plan
 * via repositories. This is where "a Work Item transition means X in the shared
 * data" is decided — the seam between the generic action model and persistence.
 *
 * Phase 1 wires the IDENTITY slice; other domains plan as UNSUPPORTED (Phase 3)
 * so nothing silently no-ops.
 */
export type TransitionPlan =
  | { kind: "IDENTITY_DECISION"; decision: "VERIFIED" | "REJECTED" }
  | { kind: "CARD_ACTIVATION" }
  | { kind: "AUDIT_ONLY" }
  | { kind: "UNSUPPORTED"; reason: string };

export function planTransition(input: {
  type: WorkType;
  toStatus: WorkStatus;
}): TransitionPlan {
  if (input.type === "VERIFY_IDENTITY") {
    // Approving identity (completing the work) verifies the customer's identity.
    if (input.toStatus === "DONE") {
      return { kind: "IDENTITY_DECISION", decision: "VERIFIED" };
    }
    // Other identity transitions (request resubmission / block / reopen) are
    // recorded but write no shared identity decision.
    return { kind: "AUDIT_ONLY" };
  }
  if (input.type === "ISSUE_CARD") {
    // Completing fulfilment (dispatched) activates the customer's card — the
    // step that can make them Protected. The encode/dispatch sub-steps are
    // tracked on the Work Item; only completion writes device state.
    if (input.toStatus === "DONE") {
      return { kind: "CARD_ACTIVATION" };
    }
    return { kind: "AUDIT_ONLY" };
  }
  return {
    kind: "UNSUPPORTED",
    reason: `Persistence for work type ${input.type} is not wired yet.`,
  };
}
