import type { OpsNote } from "@/lib/data/entities";

/**
 * Internal-notes pure core (validation + construction). Notes are Ops-owned,
 * attributed via author fields (no audit event — the note IS the record), and
 * never edited: corrections are new notes.
 */

export const MAX_NOTE_LENGTH = 2000;

/** Returns a user-facing problem, or null when the note body is acceptable. */
export function validateNoteBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "The note is empty.";
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return `Notes are limited to ${MAX_NOTE_LENGTH} characters.`;
  }
  return null;
}

export function buildOpsNote(input: {
  noteId: string;
  subjectId: string;
  authorId: string;
  authorName: string;
  body: string;
  now: string;
}): OpsNote {
  return {
    noteId: input.noteId,
    subjectId: input.subjectId,
    authorId: input.authorId,
    authorName: input.authorName,
    body: input.body.trim(),
    createdAt: input.now,
  };
}
