"use client";

import Link from "next/link";
import { Check, UserPlus } from "lucide-react";
import { Queue, type QueueBulkAction } from "@/components/queue/Queue";
import { QueueCard } from "@/components/queue/QueueCard";
import { useToast } from "@/components/feedback/ToastProvider";
import { WORK_STATUSES, STATUS_META } from "@/lib/work/status";
import { PRIORITIES, PRIORITY_META, byPriorityDesc } from "@/lib/work/priority";
import { formatDate } from "@/lib/format";
import type { WorkItem } from "@/lib/work/types";

/**
 * The ONE queue for any work domain. Every operational queue (Identity
 * Verification, Card Fulfilment, …) is this component fed a different
 * projection of work items — no per-domain queue logic. Filters by status,
 * priority, and assignee (derived from the items), sorts by priority/due, and
 * every row opens the single Customer Workspace. Bulk actions are mock in
 * Sprint 3.
 */
export function WorkQueue({
  items,
  primaryBulkLabel,
  emptyTitle = "Queue is clear",
  emptyDescription = "No work is waiting here.",
}: {
  items: WorkItem[];
  /**
   * Label for the domain's primary bulk action (e.g. "Approve", "Mark
   * dispatched"). A string so the props stay serialisable across the
   * server→client boundary; the handler + icon live here, in the client.
   */
  primaryBulkLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { toast } = useToast();
  const assignees = Array.from(
    new Set(items.map((i) => i.assignment.assigneeName ?? "Unassigned")),
  );

  const bulkActions: QueueBulkAction[] = [
    {
      id: "assign",
      label: "Assign to me",
      icon: UserPlus,
      onRun: (ids) => toast(`Assigned ${ids.length} item(s) to you (mock)`, "mock"),
    },
    ...(primaryBulkLabel
      ? [
          {
            id: "primary",
            label: primaryBulkLabel,
            icon: Check,
            onRun: (ids: string[]) =>
              toast(`${primaryBulkLabel} — ${ids.length} item(s) (mock)`, "mock"),
          },
        ]
      : []),
  ];

  return (
    <Queue<WorkItem>
      items={items}
      getId={(item) => item.id}
      pageSize={8}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      bulkActions={bulkActions}
      filters={[
        {
          key: "status",
          label: "statuses",
          getValue: (item) => item.status,
          options: WORK_STATUSES.map((s) => ({
            value: s,
            label: STATUS_META[s].label,
          })),
        },
        {
          key: "priority",
          label: "priorities",
          getValue: (item) => item.priority,
          options: PRIORITIES.map((p) => ({
            value: p,
            label: PRIORITY_META[p].label,
          })),
        },
        {
          key: "assignment",
          label: "assignees",
          getValue: (item) => item.assignment.assigneeName ?? "Unassigned",
          options: assignees.map((a) => ({ value: a, label: a })),
        },
      ]}
      sorts={[
        {
          key: "priority",
          label: "Priority",
          comparator: (a, b) => byPriorityDesc(a.priority, b.priority),
        },
        {
          key: "due",
          label: "Due date",
          comparator: (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        },
      ]}
      renderItem={(item) => {
        const card = (
          <QueueCard
            title={item.title}
            subtitle={item.subjectName}
            status={item.status}
            priority={item.priority}
            fields={[
              {
                label: "Owner",
                value: item.assignment.assigneeName ?? "Unassigned",
              },
              { label: "Due", value: formatDate(item.dueDate) },
              { label: "Next", value: item.nextAction },
            ]}
          />
        );
        return item.customerId ? (
          <Link
            href={`/customers/${item.customerId}`}
            className="flex min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {card}
          </Link>
        ) : (
          card
        );
      }}
    />
  );
}
