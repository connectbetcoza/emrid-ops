import type { ISODateString } from "@/types";
import type { WorkPriority } from "@/lib/work/priority";
import type { WorkStatus } from "@/lib/work/status";
import type { WorkType, WorkDomain } from "@/lib/work/work-type";
import type { WorkSource } from "@/lib/work/source";

/** Who a work item is assigned to. `assigneeName: null` ⇒ unassigned. */
export type WorkAssignment = {
  assigneeName: string | null;
  assignedAt?: ISODateString;
};

/**
 * A unit of operational work — the Work Engine's atom and the single source of
 * truth for "what is there to do". Queues, Mission Control's Today's Work, and a
 * customer's Active Work are all *projections* of these items; none of them own
 * work or define their own work shape.
 *
 * `domain` is stored (derived from `type` at generation) so projections can
 * filter cheaply. Sprint-3 instances are mock/generated.
 */
export type WorkItem = {
  id: string;
  type: WorkType;
  domain: WorkDomain;
  title: string;
  /** Display name of the subject (usually the customer). */
  subjectName: string;
  /** Present when the work is about a customer — links to that workspace. */
  customerId?: string;
  priority: WorkPriority;
  status: WorkStatus;
  assignment: WorkAssignment;
  source: WorkSource;
  createdAt: ISODateString;
  dueDate: ISODateString;
  nextAction: string;
  /**
   * Progress through the work type's forward step sequence (see lib/work/actions).
   * Defaults to 0. Lets multi-step types (e.g. Card Fulfilment) resume at the
   * right step; single-step types ignore it.
   */
  step?: number;
};

/** True for work that hasn't reached a terminal state (UI item or record). */
export function isActiveWork(item: { status: WorkStatus }): boolean {
  return item.status !== "DONE" && item.status !== "CANCELLED";
}
