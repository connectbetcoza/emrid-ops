import type { WorkItemRecord } from "@/lib/data/work-record";
import { workTypeMeta } from "@/lib/work/work-type";
import { dueDateFor } from "@/lib/work/rules";

/**
 * Customer Support pure core — building a RESOLVE_SUPPORT_QUERY Work Item from
 * an operator-logged query. Support queries are Work Items like everything
 * else (One Work Engine): the queue projects them, the Workspace actions them,
 * resolution is an audited transition. The query text itself is captured as an
 * internal note (the work item's display fields stay uniform with every other
 * type — queues deliver operators into the Workspace, where the note is read).
 */

export const MAX_QUERY_LENGTH = 2000;

/** Returns a user-facing problem, or null when the query is acceptable. */
export function validateSupportQuery(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) return "Describe the customer's query first.";
  if (trimmed.length > MAX_QUERY_LENGTH) {
    return `Support queries are limited to ${MAX_QUERY_LENGTH} characters.`;
  }
  return null;
}

/** The note body that captures the full query text alongside the work item. */
export function supportQueryNoteBody(description: string): string {
  return `Support query logged: ${description.trim()}`;
}

export function buildSupportQueryItem(input: {
  workItemId: string;
  customerId: string;
  subjectName: string;
  now: string;
}): WorkItemRecord {
  const meta = workTypeMeta("RESOLVE_SUPPORT_QUERY");
  const priority = meta.defaultPriority;
  return {
    workItemId: input.workItemId,
    customerId: input.customerId,
    workType: "RESOLVE_SUPPORT_QUERY",
    workDomain: meta.domain,
    status: "OPEN",
    priority,
    step: 0,
    assignment: { assigneeName: null },
    source: "CUSTOMER_REQUEST",
    title: meta.label,
    subjectName: input.subjectName,
    nextAction: meta.nextAction,
    dueAt: dueDateFor(input.now, priority),
    createdAt: input.now,
    updatedAt: input.now,
  };
}
