"use server";

import { requireOpsUser } from "@/lib/auth/server";
import { reportError } from "@/lib/observability/report";
import {
  getAuditRepository,
  getNoteRepository,
  getProfileRepository,
} from "@/lib/data";
import { newNoteId, nowIso } from "@/lib/data/ids";
import {
  executeContactCorrection,
  type ContactCorrectionInput,
  type ContactCorrectionResult,
} from "@/lib/customers/contact-correction";
import { reportAuthzDenial } from "@/lib/observability/report";

/**
 * CMS Stage 1 server action — thin wrapper per Rule 15; all branching lives in
 * the testable `executeContactCorrection` orchestrator.
 */
export async function correctContactDetails(
  profileId: string,
  input: ContactCorrectionInput,
): Promise<ContactCorrectionResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeContactCorrection(
      {
        profileRepo: getProfileRepository(),
        auditRepo: getAuditRepository(),
        noteRepo: getNoteRepository(),
      },
      {
        profileId,
        input,
        actor: { userId: user.userId, fullName: user.fullName, roles: user.roles },
        noteId: newNoteId(),
        now: nowIso(),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "CORRECT_CONTACT_DETAILS",
        scope: "action:correctContactDetails",
        subjectId: profileId,
      });
    }
    return result;
  } catch (error) {
    reportError(error, {
      scope: "action:correctContactDetails",
      extra: { profileId },
    });
    return { ok: false, error: "Couldn't save the correction — please try again." };
  }
}
