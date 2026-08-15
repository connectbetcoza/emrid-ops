import type {
  AuditRepository,
  NoteRepository,
  ProfileRepository,
  WorkItemRepository,
} from "@/lib/data/types";
import type { OpsNote } from "@/lib/data/entities";
import type { OpsRole } from "@/types";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";
import { buildOpsNote, validateNoteBody } from "@/lib/notes/core";
import {
  buildSupportQueryItem,
  supportQueryNoteBody,
  validateSupportQuery,
} from "@/lib/work/support-core";
import { ensurePermission } from "@/lib/auth/permissions";

/**
 * Support orchestrators (injectable, testable — the `executeTransition`
 * idiom). Authorization is enforced HERE, first, before any read or write:
 * a denied actor produces no note, no work item, and no audit event.
 */

export type SupportActor = {
  userId: string;
  fullName: string;
  roles: readonly OpsRole[];
};

export type AddNoteResult =
  | { ok: true; note: OpsNote }
  | { ok: false; error: string; denied?: true };

export async function executeAddNote(
  deps: { noteRepo: Pick<NoteRepository, "add"> },
  request: {
    subjectId: string;
    body: string;
    actor: SupportActor;
    noteId: string;
    now: string;
  },
): Promise<AddNoteResult> {
  const denied = ensurePermission({ roles: [...request.actor.roles] }, "ADD_NOTES");
  if (denied) return { ok: false, error: denied, denied: true };

  const problem = validateNoteBody(request.body);
  if (problem) return { ok: false, error: problem };

  const note = await deps.noteRepo.add(
    buildOpsNote({
      noteId: request.noteId,
      subjectId: request.subjectId,
      authorId: request.actor.userId,
      authorName: request.actor.fullName,
      body: request.body,
      now: request.now,
    }),
  );
  return { ok: true, note };
}

export type LogSupportQueryResult =
  | { ok: true; workItemId: string }
  | { ok: false; error: string; denied?: true };

export async function executeLogSupportQuery(
  deps: {
    profileRepo: Pick<ProfileRepository, "getProfile">;
    workRepo: Pick<WorkItemRepository, "create">;
    noteRepo: Pick<NoteRepository, "add">;
    auditRepo: Pick<AuditRepository, "record">;
  },
  request: {
    customerId: string;
    description: string;
    actor: SupportActor;
    workItemId: string;
    noteId: string;
    now: string;
  },
): Promise<LogSupportQueryResult> {
  const denied = ensurePermission(
    { roles: [...request.actor.roles] },
    "RESOLVE_SUPPORT",
  );
  if (denied) return { ok: false, error: denied, denied: true };

  const problem = validateSupportQuery(request.description);
  if (problem) return { ok: false, error: problem };

  const profile = await deps.profileRepo.getProfile(request.customerId);
  if (!profile) return { ok: false, error: "Customer not found." };

  const record = buildSupportQueryItem({
    workItemId: request.workItemId,
    customerId: request.customerId,
    subjectName: `${profile.firstName} ${profile.lastName}`.trim(),
    now: request.now,
  });

  await deps.workRepo.create(record);
  await deps.noteRepo.add(
    buildOpsNote({
      noteId: request.noteId,
      subjectId: request.customerId,
      authorId: request.actor.userId,
      authorName: request.actor.fullName,
      body: supportQueryNoteBody(request.description),
      now: request.now,
    }),
  );
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.WORK_TRANSITION,
    actorType: "OPS",
    actorId: request.actor.userId,
    targetType: "PROFILE",
    targetId: request.customerId,
    metadata: {
      workItemId: record.workItemId,
      toStatus: "OPEN",
      trigger: "SUPPORT_QUERY_LOGGED",
    },
  });
  return { ok: true, workItemId: record.workItemId };
}
