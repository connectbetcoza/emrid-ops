import type { OpsNote } from "@/lib/data/entities";
import type { NoteRepository } from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";

/** In-memory NoteRepository over the shared mock store (newest first). */
export class MockNoteRepository implements NoteRepository {
  async add(note: OpsNote): Promise<OpsNote> {
    const existing = mockStore.notes.get(note.subjectId) ?? [];
    if (existing.some((n) => n.noteId === note.noteId)) {
      return { ...existing.find((n) => n.noteId === note.noteId)! };
    }
    mockStore.notes.set(note.subjectId, [{ ...note }, ...existing]);
    return { ...note };
  }

  async listForSubject(subjectId: string): Promise<OpsNote[]> {
    return (mockStore.notes.get(subjectId) ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n }));
  }
}
