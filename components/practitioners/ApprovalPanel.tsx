"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { decidePractitioner } from "@/lib/work/server-actions";
import type { WorkItem } from "@/lib/work/types";
import type { PractitionerStatus } from "@/lib/data/entities";

/**
 * Practitioner account management (V1: Administration owns creation; this
 * panel activates or declines an admin-created pending account) — through the
 * SAME transition seam as every other work action (`decidePractitioner` →
 * `executeTransition`): the work item completes, the decision persists on the
 * practitioner (status + statusNotes — read back by the practitioner portal),
 * and PRACTITIONER_APPROVED/REJECTED is audited. A rejection requires a reason.
 */
export function ApprovalPanel({
  item,
  status,
  statusNotes,
}: {
  /** The active APPROVE_PRACTITIONER work item; null when already decided. */
  item: WorkItem | null;
  status: PractitionerStatus;
  statusNotes?: string;
}) {
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  if (!item) {
    // No open approval work: either the decision is recorded, or the account
    // is simply active/pending with nothing owed. Say which, honestly.
    const decided = status === "APPROVED" || status === "REJECTED";
    return (
      <div className="space-y-2 rounded-md bg-muted/50 px-3 py-2.5 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2
            className={status === "REJECTED" ? "h-4 w-4 text-danger" : "h-4 w-4 text-success"}
            aria-hidden
          />
          {decided
            ? status === "APPROVED"
              ? "Account active"
              : "Account deactivated"
            : `Status: ${status.toLowerCase()} — no account work is waiting`}
        </p>
        {statusNotes ? (
          <p className="text-muted-foreground">Notes: {statusNotes}</p>
        ) : null}
      </div>
    );
  }

  function decide(decision: "APPROVED" | "REJECTED") {
    if (!item) return;
    if (decision === "REJECTED" && !notes.trim()) {
      error("Declining needs a reason — add a note first.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await decidePractitioner({
          item,
          decision,
          notes: notes.trim() || undefined,
        });
        if (res.ok) {
          success(
            decision === "APPROVED"
              ? "Practitioner account activated"
              : "Activation declined",
          );
          router.refresh();
        } else {
          error(res.error);
        }
      } catch {
        error("Couldn't record the decision — please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Notes (required when declining)…"
        className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />
      <div className="flex flex-col gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide("APPROVED")}>
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Activate account
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() => decide("REJECTED")}
        >
          <ShieldX className="h-4 w-4" aria-hidden />
          Decline activation
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The outcome is written to the practitioner&apos;s account and shown to
        them on the practitioner portal. Every change is audited.
      </p>
    </div>
  );
}
