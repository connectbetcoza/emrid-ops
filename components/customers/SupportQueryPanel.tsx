"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { logSupportQuery } from "@/lib/customers/support-actions";

/**
 * Log a customer's support query from the Workspace. Creates a real
 * RESOLVE_SUPPORT_QUERY Work Item (it appears in the customer's Active Work
 * and the Customer Support queue) plus an internal note with the full text.
 */
export function SupportQueryPanel({ customerId }: { customerId: string }) {
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const res = await logSupportQuery(customerId, draft);
      if (res.ok) {
        success("Support query logged — it's in the support queue.");
        setDraft("");
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="support-query" className="sr-only">
        Describe the customer&apos;s query
      </label>
      <textarea
        id="support-query"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="What does the customer need help with?"
        className="w-full resize-none rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending || !draft.trim()}
        className="w-full"
      >
        <LifeBuoy className="h-4 w-4" aria-hidden />
        {pending ? "Logging…" : "Log support query"}
      </Button>
    </form>
  );
}
