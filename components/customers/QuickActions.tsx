import { CheckCircle2 } from "lucide-react";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { WorkItemRow } from "@/components/work/WorkItemRow";
import { byPriorityDesc } from "@/lib/work/priority";
import type { WorkItem } from "@/lib/work/types";

/**
 * Quick Actions — the operator's most likely next step for this customer: the
 * HIGHEST-PRIORITY active work item, rendered with its real, persisted actions
 * (the same generic `WorkItemRow` + `transitionWorkItem` path as Active Work).
 * Nothing here is mocked: when there is no active work, that is stated as the
 * positive fact it is.
 */
export function QuickActions({ work }: { work: WorkItem[] }) {
  const top = work
    .slice()
    .sort((a, b) => byPriorityDesc(a.priority, b.priority))[0];

  return (
    <ActionPanel title="Quick actions">
      {top ? (
        <ul>
          <WorkItemRow item={top} />
        </ul>
      ) : (
        <div className="flex items-center gap-2.5 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          No active work for this customer.
        </div>
      )}
    </ActionPanel>
  );
}
