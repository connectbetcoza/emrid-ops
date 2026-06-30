import type {
  AggregateRepository,
  AuditRepository,
  DeviceRepository,
  EmergencyProfileRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkStatus } from "@/lib/work/status";
import { planTransition } from "@/lib/work/transition-core";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import { protectionStatusFromFacets } from "@/lib/customers/readiness";
import { hasEmergencyInfo } from "@/lib/customers/facets";
import {
  crossesProtectedBoundary,
  protectedLivesDelta,
} from "@/lib/protection/aggregate";

/**
 * Orchestrates a Work Item transition across the repositories — the single
 * place "completing identity work verifies the customer" is composed. Pure of
 * Next/AWS (repos are injected), so it is unit-testable: it proves the dual
 * projection write, the identity-decision write, and the audit append happen
 * together. The server action is a thin wrapper that injects the real repos.
 */
export type TransitionDeps = {
  workRepo: WorkItemRepository;
  profileRepo: ProfileRepository;
  deviceRepo: DeviceRepository;
  auditRepo: AuditRepository;
  emergencyRepo: EmergencyProfileRepository;
  aggregateRepo: AggregateRepository;
};

export type ExecuteTransitionInput = {
  current: WorkItemRecord;
  toStatus: WorkStatus;
  step?: number;
  actorId: string;
  notes?: string;
};

export type ExecuteTransitionResult =
  | { ok: true; record: WorkItemRecord; persistedDecision: boolean }
  | { ok: false; error: string };

export async function executeTransition(
  deps: TransitionDeps,
  input: ExecuteTransitionInput,
): Promise<ExecuteTransitionResult> {
  const plan = planTransition({
    type: input.current.workType,
    toStatus: input.toStatus,
  });
  if (plan.kind === "UNSUPPORTED") {
    return { ok: false, error: plan.reason };
  }

  // 1. Move the Work Item (rewrites BOTH projection items together).
  const record = await deps.workRepo.transition(input.current, {
    toStatus: input.toStatus,
    step: input.step,
  });

  // 2. Apply the shared-state write the transition implies — and, when it
  //    changes a protection facet, detect a Protected-boundary crossing so the
  //    aggregate stays live without scanning profiles. Only IDENTITY_DECISION
  //    and CARD_ACTIVATION can move protection; AUDIT_ONLY never does.
  const cid = input.current.customerId;
  let eventType: string = OPS_AUDIT_EVENT.WORK_TRANSITION;

  if (plan.kind === "IDENTITY_DECISION" || plan.kind === "CARD_ACTIVATION") {
    // Facets BEFORE the write (the part being changed has its old value).
    const [profile, devices, emergency] = await Promise.all([
      deps.profileRepo.getProfile(cid),
      deps.deviceRepo.listForCustomer(cid),
      deps.emergencyRepo.getEmergencyProfile(cid),
    ]);
    const identityVerified = profile?.identityVerificationStatus === "VERIFIED";
    const cardActive = devices.some((d) => d.status === "ACTIVE");
    const emergencyPresent = hasEmergencyInfo(emergency);

    const before = protectionStatusFromFacets({
      identityVerified,
      cardActive,
      emergencyPresent,
    });

    // Apply the write.
    if (plan.kind === "IDENTITY_DECISION") {
      await deps.profileRepo.setIdentityDecision(cid, {
        decision: plan.decision,
        notes: input.notes,
        decidedByOpsUserId: input.actorId,
      });
      eventType =
        plan.decision === "VERIFIED"
          ? OPS_AUDIT_EVENT.IDENTITY_VERIFIED
          : OPS_AUDIT_EVENT.IDENTITY_REJECTED;
    } else {
      await deps.deviceRepo.markCardActive(cid);
      eventType = OPS_AUDIT_EVENT.CARD_ACTIVATED;
    }

    // Facets AFTER the write — only the changed facet differs.
    const after = protectionStatusFromFacets({
      identityVerified:
        plan.kind === "IDENTITY_DECISION"
          ? plan.decision === "VERIFIED"
          : identityVerified,
      cardActive: plan.kind === "CARD_ACTIVATION" ? true : cardActive,
      emergencyPresent,
    });

    // 2b. Maintain the aggregate ONLY on a Protected-boundary crossing.
    const delta = protectedLivesDelta(before, after);
    if (crossesProtectedBoundary(delta)) {
      await deps.aggregateRepo.adjustProtectedLives(delta);
    }
  }

  // 3. Append an audit event (append-only).
  await deps.auditRepo.record({
    eventType,
    actorType: "OPS",
    actorId: input.actorId,
    targetType: "PROFILE",
    targetId: input.current.customerId,
    metadata: { workItemId: input.current.workItemId, toStatus: input.toStatus },
  });

  return {
    ok: true,
    record,
    persistedDecision:
      plan.kind === "IDENTITY_DECISION" || plan.kind === "CARD_ACTIVATION",
  };
}
