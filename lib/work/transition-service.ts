import type {
  AggregateRepository,
  AuditRepository,
  DeviceRepository,
  EmergencyProfileRepository,
  PractitionerRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkStatus } from "@/lib/work/status";
import { planTransition } from "@/lib/work/transition-core";
import { workTypeMeta } from "@/lib/work/work-type";
import {
  PERMISSION_DENIED_MESSAGE,
  WORK_DOMAIN_PERMISSION,
  hasPermission,
} from "@/lib/auth/permissions";
import type { OpsRole } from "@/types";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import { protectionStatusFromFacets } from "@/lib/customers/readiness";
import { cardActiveFacet } from "@/lib/data/entities";
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
  practitionerRepo: PractitionerRepository;
};

export type ExecuteTransitionInput = {
  current: WorkItemRecord;
  toStatus: WorkStatus;
  step?: number;
  /** The acting operator — roles are enforced HERE (authoritative), against
   * the domain derived from the item's TYPE, never a client-sent domain. */
  actor: { userId: string; roles: readonly OpsRole[] };
  notes?: string;
  /** Explicit decision for decision-bearing types (practitioner approval). */
  decision?: "APPROVED" | "REJECTED";
};

export type ExecuteTransitionResult =
  | { ok: true; record: WorkItemRecord; persistedDecision: boolean }
  | { ok: false; error: string; denied?: true };

export async function executeTransition(
  deps: TransitionDeps,
  input: ExecuteTransitionInput,
): Promise<ExecuteTransitionResult> {
  // 0. Authorization FIRST — before any read or write. The required
  //    permission comes from the item's type→domain (server-owned metadata).
  const domain = workTypeMeta(input.current.workType).domain;
  if (!hasPermission({ roles: [...input.actor.roles] }, WORK_DOMAIN_PERMISSION[domain])) {
    return { ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true };
  }

  const plan = planTransition({
    type: input.current.workType,
    toStatus: input.toStatus,
    decision: input.decision,
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

  if (plan.kind === "IDENTITY_DECISION") {
    // Facets BEFORE the write (identity is the facet being changed).
    const [profile, devices, emergency] = await Promise.all([
      deps.profileRepo.getProfile(cid),
      deps.deviceRepo.listForCustomer(cid),
      deps.emergencyRepo.getEmergencyProfile(cid),
    ]);
    const identityVerified = profile?.identityVerificationStatus === "VERIFIED";
    // Shared facet — a Digital Medical ID must not make a customer PROTECTED
    // here either, or verifying their identity would cross the boundary while
    // the directory entry (which filters) still reads "In progress".
    const cardActive = cardActiveFacet(devices);
    const emergencyPresent = hasEmergencyInfo(emergency);

    const before = protectionStatusFromFacets({
      identityVerified,
      cardActive,
      emergencyPresent,
    });

    await deps.profileRepo.setIdentityDecision(cid, {
      decision: plan.decision,
      notes: input.notes,
      decidedByOpsUserId: input.actor.userId,
    });
    eventType =
      plan.decision === "VERIFIED"
        ? OPS_AUDIT_EVENT.IDENTITY_VERIFIED
        : OPS_AUDIT_EVENT.IDENTITY_REJECTED;

    const after = protectionStatusFromFacets({
      identityVerified: plan.decision === "VERIFIED",
      cardActive,
      emergencyPresent,
    });

    // Identity-driven crossings are app-side (a Profile write does not carry
    // device crossing semantics on the stream); device-driven crossings are
    // owned EXCLUSIVELY by the producer's applyDeviceCrossing (2b model).
    const delta = protectedLivesDelta(before, after);
    if (crossesProtectedBoundary(delta)) {
      await deps.aggregateRepo.adjustProtectedLives(delta);
    }
  } else if (plan.kind === "CARD_ACTIVATION") {
    // Device write ONLY — the device mutation streams to the producer, which
    // owns the resulting Protected-boundary crossing (2b ownership model).
    // Adjusting here as well would double-count.
    await deps.deviceRepo.markCardActive(cid);
    eventType = OPS_AUDIT_EVENT.CARD_ACTIVATED;
  } else if (plan.kind === "PRACTITIONER_DECISION") {
    // Record the decision on the practitioner (status + statusNotes) — the
    // write the practitioner portal reads back. Practitioners are not
    // customers: no protection facet is touched, the aggregate never moves.
    await deps.practitionerRepo.setApprovalDecision(cid, {
      decision: plan.decision,
      notes: input.notes,
      decidedByOpsUserId: input.actor.userId,
    });
    eventType =
      plan.decision === "APPROVED"
        ? OPS_AUDIT_EVENT.PRACTITIONER_APPROVED
        : OPS_AUDIT_EVENT.PRACTITIONER_REJECTED;
  }

  // 3. Append an audit event (append-only). Practitioner work targets the
  //    practitioner's USER identity, not a patient PROFILE.
  const practitionerWork = input.current.workDomain === "PRACTITIONER";
  await deps.auditRepo.record({
    eventType,
    actorType: "OPS",
    actorId: input.actor.userId,
    targetType: practitionerWork ? "USER" : "PROFILE",
    targetId: input.current.customerId,
    metadata: { workItemId: input.current.workItemId, toStatus: input.toStatus },
  });

  return {
    ok: true,
    record,
    persistedDecision:
      plan.kind === "IDENTITY_DECISION" ||
      plan.kind === "CARD_ACTIVATION" ||
      plan.kind === "PRACTITIONER_DECISION",
  };
}
