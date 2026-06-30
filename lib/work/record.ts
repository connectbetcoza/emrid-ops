import type { WorkItem } from "@/lib/work/types";
import type { WorkItemRecord } from "@/lib/data/work-record";

/**
 * Mappers between the UI `WorkItem` (lib/work/types) and the persisted
 * `WorkItemRecord` (lib/data/work-record). The repository deals in records; the
 * UI renders WorkItems. Keeping the mapping in one place means the persistence
 * field names (`workItemId`, `dueAt`, …) and the UI names (`id`, `dueDate`, …)
 * never drift.
 */
export function recordToWorkItem(r: WorkItemRecord): WorkItem {
  return {
    id: r.workItemId,
    type: r.workType,
    domain: r.workDomain,
    title: r.title,
    subjectName: r.subjectName,
    customerId: r.customerId,
    priority: r.priority,
    status: r.status,
    assignment: r.assignment,
    source: r.source,
    createdAt: r.createdAt,
    dueDate: r.dueAt,
    nextAction: r.nextAction,
    step: r.step,
  };
}

/** Convert a customer-linked UI WorkItem into a persisted record. */
export function workItemToRecord(
  w: WorkItem & { customerId: string },
): WorkItemRecord {
  return {
    workItemId: w.id,
    customerId: w.customerId,
    workType: w.type,
    workDomain: w.domain,
    status: w.status,
    priority: w.priority,
    step: w.step ?? 0,
    assignment: w.assignment,
    source: w.source,
    title: w.title,
    subjectName: w.subjectName,
    nextAction: w.nextAction,
    dueAt: w.dueDate,
    createdAt: w.createdAt,
    updatedAt: w.createdAt,
  };
}
