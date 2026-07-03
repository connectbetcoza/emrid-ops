import { History } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import type { WorkItem } from "@/lib/work/types";

/**
 * Completed/cancelled work for this customer — the escalation history. A
 * read-only projection of the same Work Items every other surface reads;
 * resolution details live in the audit timeline and internal notes.
 */
export function WorkHistory({ items }: { items: WorkItem[] }) {
  return (
    <Card className="space-y-3">
      <CardTitle>Work history</CardTitle>
      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="No completed work"
          description="Resolved and cancelled work items will appear here."
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  Raised {formatDate(item.createdAt)}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
