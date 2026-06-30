import type { TimelineEvent } from "@/components/workspace/TimelineArea";
import type { WorkItem } from "@/lib/work/types";

/**
 * Operational engine contracts.
 *
 * Each dashboard surface is fed by an "engine" — a deterministic function that
 * produces the data the widget renders. Sprint 2 engines are mock/rule-based;
 * the contract is intentionally output-only so a later sprint can replace an
 * engine's body (e.g. with an LLM) without touching the widget that consumes
 * it. Widgets depend on these types, never on the engine's internals.
 */

export type BriefStat = { label: string; value: number };

export type PriorityStat = {
  label: string;
  value: number;
  href: string;
  urgent?: boolean;
};

export type HealthMetric = {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger";
};

export type AlertSeverity = "info" | "warning" | "critical";

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
};

/** The north-star figure: how many lives are actively protected. */
export type ProtectedLives = {
  protected: number;
  total: number;
  /** Net change over the trailing week. */
  weeklyDelta: number;
  direction: "up" | "down" | "flat";
};

export type BriefingOutput = {
  yesterday: BriefStat[];
  priorities: PriorityStat[];
};

export type HealthOutput = {
  score: number;
  metrics: HealthMetric[];
};

/** A next-best-action suggestion. Stub in Sprint 2; LLM-backed later. */
export type Recommendation = {
  id: string;
  title: string;
  rationale: string;
  href?: string;
};

export type WorkOutput = WorkItem[];
export type AlertOutput = OperationalAlert[];
export type ActivityOutput = TimelineEvent[];
export type RecommendationOutput = Recommendation[];
