import Link from "next/link";
import { workSubjectHref } from "@/lib/work/work-type";
import { ArrowRight, CalendarClock, UserCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { formatDate } from "@/lib/format";
import type { WorkItem } from "@/lib/work/types";
import { cn } from "@/lib/utils";

/**
 * Reusable Work Item card. Surfaces a work item's essentials — title, subject,
 * priority, status, assignee, due date, next action. When the work is linked to
 * a customer it deep-links into that customer's workspace (delivering the
 * operator into the single Customer Workspace). Presentational only.
 */
export function WorkItemCard({
  item,
  className,
}: {
  item: WorkItem;
  className?: string;
}) {
  const owner = item.assignment.assigneeName ?? "Unassigned";
  const titleNode = item.customerId ? (
    <Link
      href={workSubjectHref(item.domain, item.customerId)}
      className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {item.title}
    </Link>
  ) : (
    <span className="truncate text-sm font-medium text-foreground">
      {item.title}
    </span>
  );

  return (
    <Card className={cn("space-y-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {titleNode}
          <p className="truncate text-sm text-muted-foreground">
            {item.subjectName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
          {owner}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Due {formatDate(item.dueDate)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border pt-3 text-sm">
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-muted-foreground">Next:</span>
        <span className="truncate font-medium text-foreground">
          {item.nextAction}
        </span>
      </div>
    </Card>
  );
}
