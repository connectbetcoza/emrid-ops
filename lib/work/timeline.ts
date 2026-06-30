import { CirclePlus, Clock, Pause, UserCheck } from "lucide-react";
import type { TimelineEvent } from "@/components/workspace/TimelineArea";
import { formatDate } from "@/lib/format";
import { workSourceLabel } from "@/lib/work/source";
import type { WorkItem } from "@/lib/work/types";

/**
 * WorkTimeline — the lifecycle of a single work item, derived from its current
 * state. Deterministic/mock in Sprint 3; a later sprint sources real events
 * from the audit trail behind the same shape.
 */
export function workTimeline(item: WorkItem): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (item.status === "IN_PROGRESS") {
    events.push({
      id: "progress",
      time: "In progress",
      title: "Work started",
      icon: Clock,
    });
  } else if (item.status === "BLOCKED" || item.status === "WAITING") {
    events.push({
      id: "blocked",
      time: "Now",
      title: item.status === "BLOCKED" ? "Blocked" : "Waiting",
      icon: Pause,
    });
  }

  if (item.assignment.assigneeName) {
    events.push({
      id: "assigned",
      time: "Assigned",
      title: `Assigned to ${item.assignment.assigneeName}`,
      icon: UserCheck,
    });
  }

  events.push({
    id: "created",
    time: formatDate(item.createdAt),
    title: "Work created",
    description: workSourceLabel(item.source),
    icon: CirclePlus,
  });

  return events;
}
