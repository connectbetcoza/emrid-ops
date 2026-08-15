import type {
  AuditRepository,
  PractitionerRepository,
  UpdatePracticeInput,
  UpdatePractitionerAccountInput,
  WorkItemRepository,
} from "@/lib/data/types";
import type { OpsRole } from "@/types";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import {
  validateLoginLink,
  validateOnboarding,
  type OnboardingInput,
} from "@/lib/practitioners/manage-core";
import { ensurePermission } from "@/lib/auth/permissions";

/**
 * Practitioner Management orchestrators (injectable, testable). Authorization
 * (MANAGE_PRACTITIONERS) is enforced HERE, first — a denied actor produces no
 * practice, no practitioner, no link, no audit event.
 */

export type ManageActor = { userId: string; roles: readonly OpsRole[] };

export type ManageServiceResult =
  | { ok: true; practitionerId: string }
  | { ok: false; error: string; denied?: true };

type ManageDeps = {
  practitionerRepo: PractitionerRepository;
  auditRepo: Pick<AuditRepository, "record">;
};

function deniedResult(actor: ManageActor): ManageServiceResult | null {
  const denied = ensurePermission({ roles: [...actor.roles] }, "MANAGE_PRACTITIONERS");
  return denied ? { ok: false, error: denied, denied: true } : null;
}

export async function executeOnboardPractitioner(
  deps: ManageDeps,
  request: {
    input: OnboardingInput;
    actor: ManageActor;
    practiceId: string;
    generatedPractitionerId: string;
  },
): Promise<ManageServiceResult> {
  const denial = deniedResult(request.actor);
  if (denial) return denial;

  const problem = validateOnboarding(request.input);
  if (problem) return { ok: false, error: problem };

  const practitionerId =
    request.input.cognitoUserId?.trim() || request.generatedPractitionerId;
  const practice = await deps.practitionerRepo.createPractice({
    practiceId: request.practiceId,
    name: request.input.practiceName.trim(),
    email: request.input.practiceEmail.trim(),
    phone: request.input.practicePhone?.trim() || undefined,
    address: request.input.practiceAddress?.trim() || undefined,
  });
  await deps.practitionerRepo.createPractitioner({
    practitionerId,
    practiceId: practice.practiceId,
    fullName: request.input.fullName.trim(),
    email: request.input.email.trim(),
    registrationNumber: request.input.registrationNumber?.trim() || undefined,
    status: "APPROVED", // V1: internal onboarding activates immediately
  });
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.PRACTITIONER_ONBOARDED,
    actorType: "OPS",
    actorId: request.actor.userId,
    targetType: "USER",
    targetId: practitionerId,
    metadata: { practiceId: practice.practiceId },
  });
  return { ok: true, practitionerId };
}

export async function executeAccountUpdate(
  deps: ManageDeps,
  request: {
    practitionerId: string;
    practiceId: string;
    practitioner: UpdatePractitionerAccountInput;
    practice: UpdatePracticeInput;
    actor: ManageActor;
  },
): Promise<ManageServiceResult> {
  const denial = deniedResult(request.actor);
  if (denial) return denial;

  if (Object.keys(request.practitioner).length > 0) {
    await deps.practitionerRepo.updatePractitionerAccount(
      request.practitionerId,
      request.practitioner,
    );
  }
  if (Object.keys(request.practice).length > 0) {
    await deps.practitionerRepo.updatePractice(request.practiceId, request.practice);
  }
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.PRACTITIONER_UPDATED,
    actorType: "OPS",
    actorId: request.actor.userId,
    targetType: "USER",
    targetId: request.practitionerId,
    metadata: {
      practiceId: request.practiceId,
      fields: [
        ...Object.keys(request.practitioner),
        ...Object.keys(request.practice).map((k) => `practice.${k}`),
      ],
    },
  });
  return { ok: true, practitionerId: request.practitionerId };
}

export async function executeLoginLink(
  deps: ManageDeps & { workRepo: Pick<WorkItemRepository, "listForCustomer"> },
  request: { currentId: string; cognitoUserId: string; actor: ManageActor },
): Promise<ManageServiceResult> {
  const denial = deniedResult(request.actor);
  if (denial) return denial;

  const problem = validateLoginLink(request.currentId, request.cognitoUserId);
  if (problem) return { ok: false, error: problem };

  const openWork = (
    await deps.workRepo.listForCustomer(request.currentId)
  ).filter((w) => w.status !== "DONE" && w.status !== "CANCELLED");
  if (openWork.length > 0) {
    return {
      ok: false,
      error: "Resolve this account's open work items before linking a login.",
    };
  }

  const linked = await deps.practitionerRepo.linkPractitionerLogin(
    request.currentId,
    request.cognitoUserId.trim(),
  );
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.PRACTITIONER_UPDATED,
    actorType: "OPS",
    actorId: request.actor.userId,
    targetType: "USER",
    targetId: linked.practitionerId,
    metadata: { linkedFrom: request.currentId, fields: ["practitionerId"] },
  });
  return { ok: true, practitionerId: linked.practitionerId };
}
