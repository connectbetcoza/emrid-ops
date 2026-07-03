"use server";

import { requireOpsUser } from "@/lib/auth/server";
import { getAuditRepository, getPractitionerRepository } from "@/lib/data";
import { newPracticeId, newPractitionerId } from "@/lib/data/ids";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import {
  validateOnboarding,
  type OnboardingInput,
} from "@/lib/practitioners/manage-core";
import type {
  UpdatePracticeInput,
  UpdatePractitionerAccountInput,
} from "@/lib/data/types";

/**
 * Practitioner Management server actions (V1: Administration owns creation).
 * Thin wrappers per Rule 15 — validation lives in the pure manage-core; the
 * repositories own the writes; every change is audited against the
 * practitioner's USER identity. In production the stream producer refreshes
 * the practitioner directory entry from these writes automatically.
 */
export type ManageResult =
  | { ok: true; practitionerId: string }
  | { ok: false; error: string };

export async function onboardPractitioner(
  input: OnboardingInput,
): Promise<ManageResult> {
  const user = await requireOpsUser();
  const problem = validateOnboarding(input);
  if (problem) return { ok: false, error: problem };

  const repo = getPractitionerRepository();
  const practitionerId = input.cognitoUserId?.trim() || newPractitionerId();

  try {
    const practice = await repo.createPractice({
      practiceId: newPracticeId(),
      name: input.practiceName.trim(),
      email: input.practiceEmail.trim(),
      phone: input.practicePhone?.trim() || undefined,
      address: input.practiceAddress?.trim() || undefined,
    });
    await repo.createPractitioner({
      practitionerId,
      practiceId: practice.practiceId,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      registrationNumber: input.registrationNumber?.trim() || undefined,
      status: "APPROVED", // V1: internal onboarding activates immediately
    });
    await getAuditRepository().record({
      eventType: OPS_AUDIT_EVENT.PRACTITIONER_ONBOARDED,
      actorType: "OPS",
      actorId: user.userId,
      targetType: "USER",
      targetId: practitionerId,
      metadata: { practiceId: practice.practiceId },
    });
    return { ok: true, practitionerId };
  } catch {
    return { ok: false, error: "Couldn't create the practitioner — please try again." };
  }
}

export type AccountUpdateInput = {
  practitionerId: string;
  practiceId: string;
  practitioner: UpdatePractitionerAccountInput;
  practice: UpdatePracticeInput;
};

export async function updatePractitionerAccount(
  input: AccountUpdateInput,
): Promise<ManageResult> {
  const user = await requireOpsUser();
  const repo = getPractitionerRepository();
  try {
    if (Object.keys(input.practitioner).length > 0) {
      await repo.updatePractitionerAccount(input.practitionerId, input.practitioner);
    }
    if (Object.keys(input.practice).length > 0) {
      await repo.updatePractice(input.practiceId, input.practice);
    }
    await getAuditRepository().record({
      eventType: OPS_AUDIT_EVENT.PRACTITIONER_UPDATED,
      actorType: "OPS",
      actorId: user.userId,
      targetType: "USER",
      targetId: input.practitionerId,
      metadata: {
        practiceId: input.practiceId,
        fields: [
          ...Object.keys(input.practitioner),
          ...Object.keys(input.practice).map((k) => `practice.${k}`),
        ],
      },
    });
    return { ok: true, practitionerId: input.practitionerId };
  } catch {
    return { ok: false, error: "Couldn't save the changes — please try again." };
  }
}
