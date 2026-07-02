"use server";

import { requireOpsUser } from "@/lib/auth/server";
import {
  getAggregateRepository,
  getAuditRepository,
  getDeviceRepository,
  getEmergencyProfileRepository,
  getPractitionerRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { executeTransition } from "@/lib/work/transition-service";
import { workItemToRecord } from "@/lib/work/record";
import type { WorkItem } from "@/lib/work/types";
import type { WorkStatus } from "@/lib/work/status";

/**
 * Server Action seam for Work Item transitions — the single server-side entry
 * point. Auth-guarded; maps the current UI work item to a persisted record and
 * delegates to `executeTransition`, which moves the Work Item (dual projection
 * write), applies the implied shared-state write, and appends audit. Selects
 * mock vs DynamoDB repos via `USE_MOCK_DATA`. Returns a serialisable result;
 * fails closed for unsupported/non-customer work. (Wired into `WorkItemRow` in
 * the next phase.)
 */
export type TransitionInput = {
  item: WorkItem;
  toStatus: WorkStatus;
  step?: number;
  notes?: string;
};

export type TransitionResult =
  | { ok: true; persistedDecision: boolean }
  | { ok: false; error: string };

export async function transitionWorkItem(
  input: TransitionInput,
): Promise<TransitionResult> {
  const user = await requireOpsUser();

  if (!input.item.customerId) {
    return { ok: false, error: "Only customer-linked work can be transitioned." };
  }

  const current = workItemToRecord({
    ...input.item,
    customerId: input.item.customerId,
  });

  const result = await executeTransition(
    {
      workRepo: getWorkItemRepository(),
      profileRepo: getProfileRepository(),
      deviceRepo: getDeviceRepository(),
      auditRepo: getAuditRepository(),
      emergencyRepo: getEmergencyProfileRepository(),
      aggregateRepo: getAggregateRepository(),
      practitionerRepo: getPractitionerRepository(),
    },
    {
      current,
      toStatus: input.toStatus,
      step: input.step,
      actorId: user.userId,
      notes: input.notes,
    },
  );

  return result.ok
    ? { ok: true, persistedDecision: result.persistedDecision }
    : { ok: false, error: result.error };
}

export type PractitionerDecisionActionInput = {
  item: WorkItem;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
};

/**
 * Decide a practitioner application (approve / reject + notes) — the Approval
 * panel's action. Same seam as every transition: `executeTransition` moves the
 * work item to DONE, writes the decision (status + statusNotes on the
 * practitioner item), and appends the PRACTITIONER_APPROVED/REJECTED audit.
 */
export async function decidePractitioner(
  input: PractitionerDecisionActionInput,
): Promise<TransitionResult> {
  const user = await requireOpsUser();

  if (!input.item.customerId || input.item.type !== "APPROVE_PRACTITIONER") {
    return { ok: false, error: "Only practitioner approval work can be decided here." };
  }
  if (input.decision === "REJECTED" && !input.notes?.trim()) {
    return { ok: false, error: "A rejection needs a reason — add a note." };
  }

  const current = workItemToRecord({
    ...input.item,
    customerId: input.item.customerId,
  });

  const result = await executeTransition(
    {
      workRepo: getWorkItemRepository(),
      profileRepo: getProfileRepository(),
      deviceRepo: getDeviceRepository(),
      auditRepo: getAuditRepository(),
      emergencyRepo: getEmergencyProfileRepository(),
      aggregateRepo: getAggregateRepository(),
      practitionerRepo: getPractitionerRepository(),
    },
    {
      current,
      toStatus: "DONE",
      step: (input.item.step ?? 0) + 1,
      actorId: user.userId,
      notes: input.notes,
      decision: input.decision,
    },
  );

  return result.ok
    ? { ok: true, persistedDecision: result.persistedDecision }
    : { ok: false, error: result.error };
}
