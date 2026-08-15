"use server";

import { requireOpsUser } from "@/lib/auth/server";
import { reportAuthzDenial, reportError } from "@/lib/observability/report";
import {
  getAuditRepository,
  getPractitionerRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { newPracticeId, newPractitionerId } from "@/lib/data/ids";
import type { OnboardingInput } from "@/lib/practitioners/manage-core";
import {
  executeAccountUpdate,
  executeLoginLink,
  executeOnboardPractitioner,
  type ManageServiceResult,
} from "@/lib/practitioners/manage-service";
import type {
  UpdatePracticeInput,
  UpdatePractitionerAccountInput,
} from "@/lib/data/types";

/**
 * Practitioner Management server actions — thin Rule-15 wrappers; validation
 * AND authoritative per-action authorization live in the testable
 * manage-service orchestrators. Denials emit the security signal, never an
 * application-failure report.
 */
export type ManageResult = ManageServiceResult;

function actorOf(user: { userId: string; roles: readonly string[] }) {
  return { userId: user.userId, roles: user.roles as ManageActorRoles };
}
type ManageActorRoles = Parameters<typeof executeOnboardPractitioner>[1]["actor"]["roles"];

export async function onboardPractitioner(
  input: OnboardingInput,
): Promise<ManageResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeOnboardPractitioner(
      { practitionerRepo: getPractitionerRepository(), auditRepo: getAuditRepository() },
      {
        input,
        actor: actorOf(user),
        practiceId: newPracticeId(),
        generatedPractitionerId: newPractitionerId(),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "MANAGE_PRACTITIONERS",
        scope: "action:onboardPractitioner",
      });
    }
    return result;
  } catch (error) {
    reportError(error, { scope: "action:onboardPractitioner" });
    return { ok: false, error: "Couldn't create the practitioner — please try again." };
  }
}

export async function linkPractitionerLogin(
  currentId: string,
  cognitoUserId: string,
): Promise<ManageResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeLoginLink(
      {
        practitionerRepo: getPractitionerRepository(),
        auditRepo: getAuditRepository(),
        workRepo: getWorkItemRepository(),
      },
      { currentId, cognitoUserId, actor: actorOf(user) },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "MANAGE_PRACTITIONERS",
        scope: "action:linkPractitionerLogin",
        subjectId: currentId,
      });
    }
    return result;
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message === "A practitioner already exists for that login."
        ? error.message
        : "Couldn't link the login — please try again.";
    // The id-collision case is an expected user-facing outcome, not a fault.
    if (message === "Couldn't link the login — please try again.") {
      reportError(error, { scope: "action:linkPractitionerLogin" });
    }
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
  try {
    const result = await executeAccountUpdate(
      { practitionerRepo: getPractitionerRepository(), auditRepo: getAuditRepository() },
      {
        practitionerId: input.practitionerId,
        practiceId: input.practiceId,
        practitioner: input.practitioner,
        practice: input.practice,
        actor: actorOf(user),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "MANAGE_PRACTITIONERS",
        scope: "action:updatePractitionerAccount",
        subjectId: input.practitionerId,
      });
    }
    return result;
  } catch (error) {
    reportError(error, { scope: "action:updatePractitionerAccount" });
    return { ok: false, error: "Couldn't save the changes — please try again." };
  }
}
