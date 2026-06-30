"use client";

import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSquare } from "lucide-react";
import type { InternalNote } from "@/lib/customers/workspace";

/**
 * Internal Notes — staff notes on a customer. The composer is **ephemeral** in
 * Sprint 2: added notes live in local state only and are not persisted (no
 * backend yet). It demonstrates the interaction; a later sprint wires it to a
 * server action. A hint makes the non-persistence explicit.
 */
export function InternalNotes({ initialNotes }: { initialNotes: InternalNote[] }) {
  const [notes, setNotes] = useState<InternalNote[]>(initialNotes);
  const [draft, setDraft] = useState("");

  function addNote() {
    const body = draft.trim();
    if (!body) return;
    setNotes((prev) => [
      { id: `local-${prev.length}`, author: "You", time: "Just now", body },
      ...prev,
    ]);
    setDraft("");
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle>Internal notes</CardTitle>
        <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
          Not saved · mock
        </span>
      </div>

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
          <Button size="sm" onClick={addNote} disabled={!draft.trim()}>
            Add note
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
            <li key={note.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {note.author}
                </span>
                <span className="text-xs text-muted-foreground">{note.time}</span>
              </div>
              <p className="text-sm text-muted-foreground">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
