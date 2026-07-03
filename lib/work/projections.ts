import { byPriorityDesc } from "@/lib/work/priority";
import { isActiveWork, type WorkItem } from "@/lib/work/types";
import type { WorkDomain } from "@/lib/work/work-type";

/**
 * Work projections — read-only views over the Work Engine's items. This is the
 * core Sprint-3 principle in code: **queues do not own work; they are filtered
 * projections of work items.** Mission Control's Today's Work, a customer's
 * Active Work, and every domain queue are all functions here. Pure + tested.
 */

/** Sort active-first then by priority (desc) then by due date (asc). */
function byUrgency(a: WorkItem, b: WorkItem): number {
  const p = byPriorityDesc(a.priority, b.priority);
  if (p !== 0) return p;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
}

/** Mission Control — the most pressing active work across the platform. */
export function todaysWork(items: WorkItem[], limit?: number): WorkItem[] {
  const active = items.filter(isActiveWork).slice().sort(byUrgency);
  return limit !== undefined ? active.slice(0, limit) : active;
}

/** Customer Workspace — active work for one customer. */
export function activeWork(items: WorkItem[], customerId: string): WorkItem[] {
  return items
    .filter((w) => w.customerId === customerId && isActiveWork(w))
    .slice()
    .sort(byUrgency);
}

export function countActiveWork(items: WorkItem[], customerId: string): number {
  return items.filter((w) => w.customerId === customerId && isActiveWork(w))
    .length;
}

/**
 * Customer Workspace — completed/cancelled work for one customer, newest
 * first. The support "escalation history": what was raised and how it ended,
 * projected from the same items as everything else.
 */
export function workHistory(items: WorkItem[], customerId: string): WorkItem[] {
  return items
    .filter((w) => w.customerId === customerId && !isActiveWork(w))
    .slice()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * A queue — the projection of work items in one domain. Identity Verification
 * is `queueForDomain(items, "IDENTITY")`. Returns all statuses (the Queue UI
 * filters); ordered by urgency.
 */
export function queueForDomain(
  items: WorkItem[],
  domain: WorkDomain,
): WorkItem[] {
  return items
    .filter((w) => w.domain === domain)
    .slice()
    .sort(byUrgency);
}
