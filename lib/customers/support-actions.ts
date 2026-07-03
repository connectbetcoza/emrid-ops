"use server";

import { requireOpsUser } from "@/lib/auth/server";
import {
  getAuditRepository,
  getNoteRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import type { OpsNote } from "@/lib/data/entities";
import { newNoteId, newSupportQueryId, nowIso } from "@/lib/data/ids";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import { buildOpsNote, validateNoteBody } from "@/lib/notes/core";
import {
  buildSupportQueryItem,
  supportQueryNoteBody,
  validateSupportQuery,
} from "@/lib/work/support-core";

/**
 * Customer Support server actions — thin wrappers per Rule 15. Notes persist as
 * Ops-owned items (attributed by author fields; no audit event — the note IS
 * the record). Logging a support query creates a real Work Item through the one
 * Work Engine (queue + Active Work project it) plus a note carrying the full
 * query text, and appends an OPS_WORK_TRANSITION audit for the creation.
 */

export type NoteResult = { ok: true; note: OpsNote } | { ok: false; error: string };

export async function addInternalNote(
  subjectId: string,
  body: string,
): Promise<NoteResult> {
  const user = await requireOpsUser();
  const problem = validateNoteBody(body);
  if (problem) return { ok: false, error: problem };

  try {
    const note = await getNoteRepository().add(
      buildOpsNote({
        noteId: newNoteId(),
        subjectId,
        authorId: user.userId,
        authorName: user.fullName,
        body,
        now: nowIso(),
      }),
    );
    return { ok: true, note };
  } catch {
    return { ok: false, error: "Couldn't save the note — please try again." };
  }
}

export type SupportQueryResult =
  | { ok: true; workItemId: string }
  | { ok: false; error: string };

export async function logSupportQuery(
  customerId: string,
  description: string,
): Promise<SupportQueryResult> {
  const user = await requireOpsUser();
  const problem = validateSupportQuery(description);
  if (problem) return { ok: false, error: problem };

  // Fail closed on an unknown subject — support work is never minted for a
  // customer that doesn't exist.
  const profile = await getProfileRepository().getProfile(customerId);
  if (!profile) return { ok: false, error: "Customer not found." };

  const now = nowIso();
  const record = buildSupportQueryItem({
    workItemId: newSupportQueryId(customerId),
    customerId,
    subjectName: `${profile.firstName} ${profile.lastName}`.trim(),
    now,
  });

  try {
    await getWorkItemRepository().create(record);
    await getNoteRepository().add(
      buildOpsNote({
        noteId: newNoteId(),
        subjectId: customerId,
        authorId: user.userId,
        authorName: user.fullName,
        body: supportQueryNoteBody(description),
        now,
      }),
    );
    await getAuditRepository().record({
      eventType: OPS_AUDIT_EVENT.WORK_TRANSITION,
      actorType: "OPS",
      actorId: user.userId,
      targetType: "PROFILE",
      targetId: customerId,
      metadata: {
        workItemId: record.workItemId,
        toStatus: "OPEN",
        trigger: "SUPPORT_QUERY_LOGGED",
      },
    });
    return { ok: true, workItemId: record.workItemId };
  } catch {
    return { ok: false, error: "Couldn't log the query — please try again." };
  }
}
