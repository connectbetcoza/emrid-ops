import type { WorkStatus } from "@/lib/work/status";
import type { WorkType } from "@/lib/work/work-type";
import type { WorkItem } from "@/lib/work/types";

/**
 * Generic Work Item actions.
 *
 * Actions are a property of a work item's *type + status + progress*, not of any
 * one domain. Identity Verification was the first type; Card Fulfilment is the
 * second and is multi-step, so the model carries an ordered list of forward
 * "steps" per type plus the generic status transitions (resume / unblock /
 * block / reopen). Single-step types (Identity, profile, …) simply declare one
 * step. The Workspace renders these for ANY work item with no domain-specific
 * code — proving the model generalises.
 *
 * Sprint 3: transitions are deterministic and applied ephemerally in the UI
 * (no backend). A later sprint routes them through a server action without
 * changing the action shape or the rendering.
 */
export type WorkActionKind = "primary" | "secondary" | "danger";

export type WorkAction = {
  id: string;
  label: string;
  /** The status the item moves to when taken. */
  toStatus: WorkStatus;
  kind: WorkActionKind;
  /** True for forward-progress actions (advance the item's step). */
  advances?: boolean;
};

type Step = { label: string; toStatus: WorkStatus };

/**
 * Per-type flow: the ordered forward `steps` (the happy path; the last step is
 * usually terminal/DONE) and an optional `defer`. New work types declare their
 * flow here — nothing else changes.
 */
const WORK_TYPE_FLOW: Record<WorkType, { steps: Step[]; defer?: Step }> = {
  VERIFY_IDENTITY: {
    steps: [{ label: "Approve identity", toStatus: "DONE" }],
    defer: { label: "Request resubmission", toStatus: "WAITING" },
  },
  ISSUE_CARD: {
    // Dispatch ends at WAITING — awaiting the CUSTOMER's real activation — never
    // DONE. Only DONE maps to CARD_ACTIVATION in the transition plan, so an Ops
    // click can never activate the card or flip a customer to Protected
    // (operational truth over theatre). Completion on real activation is a
    // system transition (next patch: stream-driven when the device goes ACTIVE).
    steps: [
      { label: "Start encoding", toStatus: "IN_PROGRESS" },
      { label: "Mark encoded", toStatus: "IN_PROGRESS" },
      { label: "Mark tap verified", toStatus: "IN_PROGRESS" },
      { label: "Mark dispatched", toStatus: "WAITING" },
    ],
  },
  COMPLETE_PROFILE: { steps: [{ label: "Mark complete", toStatus: "DONE" }] },
  ADD_EMERGENCY_INFO: { steps: [{ label: "Mark captured", toStatus: "DONE" }] },
  ADD_EMERGENCY_CONTACT: {
    steps: [{ label: "Mark captured", toStatus: "DONE" }],
  },
  APPROVE_PRACTITIONER: {
    steps: [{ label: "Activate account", toStatus: "DONE" }],
    defer: { label: "Request info", toStatus: "WAITING" },
  },
  RESOLVE_SUPPORT_QUERY: {
    steps: [{ label: "Resolve", toStatus: "DONE" }],
    defer: { label: "Await customer", toStatus: "WAITING" },
  },
};

function isTerminal(status: WorkStatus): boolean {
  return status === "DONE" || status === "CANCELLED";
}

/**
 * The actions available for a work item, given its type, status, and progress
 * (`step`). OPEN/IN_PROGRESS expose the next forward step (+ defer, + block when
 * in progress); WAITING/BLOCKED expose only the recovery action; terminal
 * states expose Reopen.
 */
export function workActions(
  item: Pick<WorkItem, "type" | "status"> & { step?: number },
): WorkAction[] {
  if (isTerminal(item.status)) {
    return [{ id: "reopen", label: "Reopen", toStatus: "OPEN", kind: "secondary" }];
  }

  const flow = WORK_TYPE_FLOW[item.type];
  const step = item.step ?? 0;
  const actions: WorkAction[] = [];

  if (item.status === "WAITING") {
    actions.push({ id: "resume", label: "Resume", toStatus: "IN_PROGRESS", kind: "secondary" });
    return actions;
  }
  if (item.status === "BLOCKED") {
    actions.push({ id: "unblock", label: "Unblock", toStatus: "IN_PROGRESS", kind: "secondary" });
    return actions;
  }

  // OPEN or IN_PROGRESS — offer the next forward step.
  const next = flow.steps[step];
  if (next) {
    actions.push({
      id: "advance",
      label: next.label,
      toStatus: next.toStatus,
      kind: "primary",
      advances: true,
    });
  }
  if (flow.defer) {
    actions.push({
      id: "defer",
      label: flow.defer.label,
      toStatus: flow.defer.toStatus,
      kind: "secondary",
    });
  }
  if (item.status === "IN_PROGRESS") {
    actions.push({ id: "block", label: "Block", toStatus: "BLOCKED", kind: "danger" });
  }

  return actions;
}
