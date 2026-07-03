"use server";

import { requireOpsUser } from "@/lib/auth/server";
import {
  getAuditRepository,
  getPractitionerRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { newPracticeId, newPractitionerId } from "@/lib/data/ids";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import {
  validateLoginLink,
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

/**
 * Link a Cognito login to an unlinked (`prac_`) account. Re-keys the
 * practitioner record (and any grants) to the sub — the Patient Platform
 * resolves the portal session by that id. Refused while the subject has open
 * work (the work item's subject id would go stale mid-flight).
 */
export async function linkPractitionerLogin(
  currentId: string,
  cognitoUserId: string,
): Promise<ManageResult> {
  const user = await requireOpsUser();
  const problem = validateLoginLink(currentId, cognitoUserId);
  if (problem) return { ok: false, error: problem };

  const openWork = (
    await getWorkItemRepository().listForCustomer(currentId)
  ).filter((w) => w.status !== "DONE" && w.status !== "CANCELLED");
  if (openWork.length > 0) {
    return {
      ok: false,
      error: "Resolve this account's open work items before linking a login.",
    };
  }

  const sub = cognitoUserId.trim();
  try {
    const linked = await getPractitionerRepository().linkPractitionerLogin(
      currentId,
      sub,
    );
    await getAuditRepository().record({
      eventType: OPS_AUDIT_EVENT.PRACTITIONER_UPDATED,
      actorType: "OPS",
      actorId: user.userId,
      targetType: "USER",
      targetId: linked.practitionerId,
      metadata: { linkedFrom: currentId, fields: ["practitionerId"] },
    });
    return { ok: true, practitionerId: linked.practitionerId };
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message === "A practitioner already exists for that login."
        ? error.message
        : "Couldn't link the login — please try again.";
    return { ok: false, error: message };
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
