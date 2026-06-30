import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Operational work-item status — the generic lifecycle shared by every Ops
 * queue and workspace. Sprint 1 ships the vocabulary + presentation only; the
 * Work Engine that drives transitions arrives in a later sprint.
 *
 * The metadata map is an EXHAUSTIVE `Record<WorkStatus, …>`: adding a status to
 * the union forces a matching entry here (the compiler is the checklist).
 */
export type WorkStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "WAITING"
  | "DONE"
  | "CANCELLED";

export type StatusMeta = {
  /** Human label for chips and filters. */
  label: string;
  /** Design-system tone the StatusBadge renders. */
  tone: BadgeTone;
};

export const STATUS_META: Record<WorkStatus, StatusMeta> = {
  OPEN: { label: "Open", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "danger" },
  WAITING: { label: "Waiting", tone: "warning" },
  DONE: { label: "Done", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** All statuses in display order — for filter menus and legends. */
export const WORK_STATUSES: readonly WorkStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING",
  "DONE",
  "CANCELLED",
];

export function statusMeta(status: WorkStatus): StatusMeta {
  return STATUS_META[status];
}
