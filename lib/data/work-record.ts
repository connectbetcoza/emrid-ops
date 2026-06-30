import type { ISODateString } from "@/lib/data/entities";
import type { WorkPriority } from "@/lib/work/priority";
import type { WorkStatus } from "@/lib/work/status";
import type { WorkType, WorkDomain } from "@/lib/work/work-type";
import type { WorkSource } from "@/lib/work/source";
import type { WorkAssignment } from "@/lib/work/types";

/**
 * Persisted Work Item — the operational source of truth, stored in the SHARED
 * table via a dual-write (a queue projection item + a per-customer index item;
 * see `lib/data/aws/keys.ts`). Queues read these; they never query the profiles
 * table. Mirrors the UI `WorkItem` (lib/work/types.ts) with canonical
 * persistence field names (`workItemId`, `workType`, `workDomain`, `dueAt`).
 *
 * `customerId` is required — work is indexed under `PROFILE#<customerId>` for the
 * Customer Workspace's Active Work lookup. (Non-customer work, e.g. practitioner
 * approval, is handled in a later phase.)
 */
export type WorkItemRecord = {
  workItemId: string;
  customerId: string;
  workType: WorkType;
  workDomain: WorkDomain;
  status: WorkStatus;
  priority: WorkPriority;
  step: number;
  assignment: WorkAssignment;
  source: WorkSource;
  // Display fields (carried on both projection items so either read reconstructs
  // the full item without a second lookup).
  title: string;
  subjectName: string;
  nextAction: string;
  dueAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
