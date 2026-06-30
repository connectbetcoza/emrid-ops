import type { WorkPriority } from "@/lib/work/priority";
import type { WorkType } from "@/lib/work/work-type";
import type { ISODateString } from "@/types";

/**
 * Work Rules — the deterministic policy layer of the Work Engine. Pure and
 * unit-tested. Sprint 3 rules: map a readiness gap to a work type, escalate
 * priority when a customer is unprotected, and derive a due date from priority.
 * A later sprint can replace these rules (or an LLM can) without changing the
 * generators or projections that depend on them.
 */

/** Which work type closes each readiness factor gap. */
export const FACTOR_WORK_TYPE: Record<string, WorkType> = {
  profile: "COMPLETE_PROFILE",
  identity: "VERIFY_IDENTITY",
  emergency: "ADD_EMERGENCY_INFO",
  contact: "ADD_EMERGENCY_CONTACT",
  card: "ISSUE_CARD",
};

const LADDER: WorkPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/** Bump a priority up one level (URGENT is the ceiling). */
export function escalate(priority: WorkPriority): WorkPriority {
  const i = LADDER.indexOf(priority);
  return LADDER[Math.min(i + 1, LADDER.length - 1)] ?? priority;
}

/**
 * Resolve the effective priority for a piece of work. Unprotected customers
 * escalate the work that protects them — the operational expression of the
 * Protected Lives north star.
 */
export function effectivePriority(
  base: WorkPriority,
  ctx: { unprotected: boolean },
): WorkPriority {
  return ctx.unprotected ? escalate(base) : base;
}

/** Days from creation a work item is due, by priority. */
export function dueOffsetDays(priority: WorkPriority): number {
  switch (priority) {
    case "URGENT":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 3;
    case "LOW":
      return 7;
  }
}

/** Add whole days to an ISO timestamp. Pure (no `Date.now`). */
export function addDays(iso: ISODateString, days: number): ISODateString {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function dueDateFor(
  createdAt: ISODateString,
  priority: WorkPriority,
): ISODateString {
  return addDays(createdAt, dueOffsetDays(priority));
}
