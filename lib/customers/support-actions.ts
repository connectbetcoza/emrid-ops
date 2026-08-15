"use server";

import { requireOpsUser } from "@/lib/auth/server";
import { reportAuthzDenial, reportError } from "@/lib/observability/report";
import {
  getAuditRepository,
  getNoteRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { newNoteId, newSupportQueryId, nowIso } from "@/lib/data/ids";
import {
  executeAddNote,
  executeLogSupportQuery,
  type AddNoteResult,
  type LogSupportQueryResult,
} from "@/lib/customers/support-service";

/**
 * Customer Support server actions — thin Rule-15 wrappers; all branching
 * (including AUTHORITATIVE per-action authorization) lives in the testable
 * support-service orchestrators.
 */

export async function addInternalNote(
  subjectId: string,
  body: string,
): Promise<AddNoteResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeAddNote(
      { noteRepo: getNoteRepository() },
      {
        subjectId,
        body,
        actor: { userId: user.userId, fullName: user.fullName, roles: user.roles },
        noteId: newNoteId(),
        now: nowIso(),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "ADD_NOTES",
        scope: "action:addInternalNote",
        subjectId,
      });
    }
    return result;
  } catch (error) {
    reportError(error, { scope: "action:addInternalNote" });
    return { ok: false, error: "Couldn't save the note — please try again." };
  }
}

export async function logSupportQuery(
  customerId: string,
  description: string,
): Promise<LogSupportQueryResult> {
  const user = await requireOpsUser();
  try {
    const result = await executeLogSupportQuery(
      {
        profileRepo: getProfileRepository(),
        workRepo: getWorkItemRepository(),
        noteRepo: getNoteRepository(),
        auditRepo: getAuditRepository(),
      },
      {
        customerId,
        description,
        actor: { userId: user.userId, fullName: user.fullName, roles: user.roles },
        workItemId: newSupportQueryId(customerId),
        noteId: newNoteId(),
        now: nowIso(),
      },
    );
    if (!result.ok && result.denied) {
      reportAuthzDenial({
        userId: user.userId,
        permission: "RESOLVE_SUPPORT",
        scope: "action:logSupportQuery",
        subjectId: customerId,
      });
    }
    return result;
  } catch (error) {
    reportError(error, { scope: "action:logSupportQuery" });
    return { ok: false, error: "Couldn't log the query — please try again." };
  }
}
