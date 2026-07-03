"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSquare } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";
import { addInternalNote } from "@/lib/customers/support-actions";
import type { OpsNote } from "@/lib/data/entities";
import { formatDateTime } from "@/lib/format";

/**
 * Internal Notes — persisted staff notes on a subject (Ops-owned items).
 * The composer calls the server action and re-projects on success; notes are
 * append-only (corrections are new notes).
 */
export function InternalNotes({
  subjectId,
  notes,
}: {
  subjectId: string;
  notes: OpsNote[];
}) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  function addNote() {
    const body = draft.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const res = await addInternalNote(subjectId, body);
      if (res.ok) {
        success("Note saved.");
        setDraft("");
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <Card className="space-y-4">
      <CardTitle>Internal notes</CardTitle>

      <div className="space-y-2">
        <label htmlFor="note-composer" className="sr-only">
          Add an internal note
        </label>
        <textarea
          id="note-composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote();
          }}
          rows={2}
          placeholder="Add an internal note…  (⌘↵ to post)"
          className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={addNote} disabled={pending || !draft.trim()}>
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No notes yet"
          description="Internal notes about this customer will appear here."
        />
      ) : (
        <ul className="space-y-3 border-t border-border pt-3">
          {notes.map((note) => (
            <li key={note.noteId} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {note.authorName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(note.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {note.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
