import type { BadgeTone } from "@/components/ui/Badge";

/**
 * Readiness — a first-class, reusable EMRID Operations concept.
 *
 * Readiness expresses how close a customer is to becoming protected, as a 0–100
 * score over weighted factors, classified into three bands. This module is the
 * single source of truth: Mission Control, the Customers index, the Customer
 * Workspace, queues, and (later) recommendations all compute and display
 * Readiness through here — never with their own thresholds or labels.
 *
 * Pure (no React/AWS/domain coupling): `computeReadiness` takes generic
 * weighted factors, so it is reusable for any readiness-like score and fully
 * unit-testable. The customer→factors mapping lives in `lib/customers`.
 */

export type ReadinessBand = "READY" | "NEARLY" | "NOT_READY";

/** Band thresholds (agreed 3-band model). A score ≥ READY_MIN is "Ready". */
export const READY_MIN = 85;
export const NEARLY_MIN = 60;

export type ReadinessFactor = {
  key: string;
  label: string;
  /** Relative contribution to the score. */
  weight: number;
  met: boolean;
};

export type ReadinessResult = {
  /** 0–100, rounded. */
  score: number;
  band: ReadinessBand;
  factors: ReadinessFactor[];
};

export type ReadinessBandMeta = {
  label: string;
  tone: BadgeTone;
  description: string;
};

/** Exhaustive band metadata — adding a band forces its label/tone/description. */
export const READINESS_BAND_META: Record<ReadinessBand, ReadinessBandMeta> = {
  READY: {
    label: "Ready for Protection",
    tone: "success",
    description: "All essentials are in place — ready to be protected.",
  },
  NEARLY: {
    label: "Nearly Ready",
    tone: "warning",
    description: "A few steps remain before this customer can be protected.",
  },
  NOT_READY: {
    label: "Not Ready",
    tone: "danger",
    description: "Key steps are still outstanding.",
  },
};

export function bandForScore(score: number): ReadinessBand {
  if (score >= READY_MIN) return "READY";
  if (score >= NEARLY_MIN) return "NEARLY";
  return "NOT_READY";
}

/** Compute a readiness score + band from weighted factors. Pure. */
export function computeReadiness(factors: ReadinessFactor[]): ReadinessResult {
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const metWeight = factors.reduce(
    (sum, f) => sum + (f.met ? f.weight : 0),
    0,
  );
  const score =
    totalWeight === 0 ? 0 : Math.round((metWeight / totalWeight) * 100);
  return { score, band: bandForScore(score), factors };
}

export function readinessBandMeta(band: ReadinessBand): ReadinessBandMeta {
  return READINESS_BAND_META[band];
}

/** Bands in display order (most → least ready) for distributions and legends. */
export const READINESS_BANDS: readonly ReadinessBand[] = [
  "READY",
  "NEARLY",
  "NOT_READY",
];
