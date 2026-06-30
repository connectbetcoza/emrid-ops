import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Work-item priority. Like {@link WorkStatus} this is presentation vocabulary
 * for Sprint 1 — the metadata map is an exhaustive `Record<Priority, …>` so a
 * new level forces its label, tone, and sort rank.
 */
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/** Domain alias — work items are prioritised on the same scale. */
export type WorkPriority = Priority;

export type PriorityMeta = {
  label: string;
  tone: BadgeTone;
  /** Higher = more urgent. Used for queue sorting. */
  rank: number;
};

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  LOW: { label: "Low", tone: "neutral", rank: 0 },
  MEDIUM: { label: "Medium", tone: "info", rank: 1 },
  HIGH: { label: "High", tone: "warning", rank: 2 },
  URGENT: { label: "Urgent", tone: "danger", rank: 3 },
};

/** All priorities ordered most-urgent first — for filter menus and legends. */
export const PRIORITIES: readonly Priority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

export function priorityMeta(priority: Priority): PriorityMeta {
  return PRIORITY_META[priority];
}

/** Sort comparator: most-urgent first. Pure; safe for queue sorting. */
export function byPriorityDesc(a: Priority, b: Priority): number {
  return PRIORITY_META[b].rank - PRIORITY_META[a].rank;
}
