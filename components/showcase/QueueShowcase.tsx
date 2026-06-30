"use client";

import { Check, UserPlus } from "lucide-react";
import { Queue } from "@/components/queue/Queue";
import { QueueCard } from "@/components/queue/QueueCard";
import { MOCK_WORK_ITEMS } from "@/lib/work/mock";
import { WORK_STATUSES, STATUS_META } from "@/lib/work/status";
import { PRIORITIES, PRIORITY_META, byPriorityDesc } from "@/lib/work/priority";
import { WORK_DOMAIN_LABEL } from "@/lib/work/work-type";
import type { WorkItem } from "@/lib/work/types";
import { formatDate } from "@/lib/format";

/**
 * Demonstrates the reusable <Queue> over mock work items: status/priority/
 * domain filters, multiple sorts, bulk selection + bulk actions, pagination,
 * and status/priority chips — all configuration, no bespoke queue code. Bulk
 * actions are no-ops in Sprint 1 (no Work Engine yet).
 */
export function QueueShowcase() {
  return (
    <Queue<WorkItem>
      items={MOCK_WORK_ITEMS}
      getId={(item) => item.id}
      pageSize={5}
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
          key: "domain",
          label: "domains",
          getValue: (item) => item.domain,
          options: Object.entries(WORK_DOMAIN_LABEL).map(([value, label]) => ({
            value,
            label,
          })),
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
        {
          key: "subject",
          label: "Customer",
          comparator: (a, b) => a.subjectName.localeCompare(b.subjectName),
        },
      ]}
      bulkActions={[
        { id: "assign", label: "Assign to me", icon: UserPlus, onRun: () => {} },
        { id: "done", label: "Mark done", icon: Check, onRun: () => {} },
      ]}
      renderItem={(item) => (
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
      )}
    />
  );
}
