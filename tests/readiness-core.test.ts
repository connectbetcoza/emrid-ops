import { describe, it, expect } from "vitest";
import {
  computeReadiness,
  bandForScore,
  READINESS_BAND_META,
  READINESS_BANDS,
  type ReadinessFactor,
} from "@/lib/readiness/core";

function factors(...met: boolean[]): ReadinessFactor[] {
  // Five equally-weighted (20 each) factors for easy arithmetic.
  return met.map((m, i) => ({
    key: `f${i}`,
    label: `Factor ${i}`,
    weight: 20,
    met: m,
  }));
}

describe("bandForScore", () => {
  it("uses the agreed 3-band thresholds (85 / 60)", () => {
    expect(bandForScore(100)).toBe("READY");
    expect(bandForScore(85)).toBe("READY");
    expect(bandForScore(84)).toBe("NEARLY");
    expect(bandForScore(60)).toBe("NEARLY");
    expect(bandForScore(59)).toBe("NOT_READY");
    expect(bandForScore(0)).toBe("NOT_READY");
  });
});

describe("computeReadiness", () => {
  it("scores the weighted proportion of met factors", () => {
    expect(computeReadiness(factors(true, true, true, true, true)).score).toBe(100);
    expect(computeReadiness(factors(true, true, true, false, false)).score).toBe(60);
    expect(computeReadiness(factors(false, false, false, false, false)).score).toBe(0);
  });

  it("respects unequal weights", () => {
    const r = computeReadiness([
      { key: "big", label: "Big", weight: 70, met: true },
      { key: "small", label: "Small", weight: 30, met: false },
    ]);
    expect(r.score).toBe(70);
    expect(r.band).toBe("NEARLY");
  });

  it("classifies the band from the score and returns the factors", () => {
    const r = computeReadiness(factors(true, true, true, true, false)); // 80
    expect(r.score).toBe(80);
    expect(r.band).toBe("NEARLY");
    expect(r.factors).toHaveLength(5);
  });

  it("handles a zero-weight set without dividing by zero", () => {
    expect(computeReadiness([]).score).toBe(0);
  });
});

describe("band metadata", () => {
  it("has metadata for every band", () => {
    expect(Object.keys(READINESS_BAND_META).sort()).toEqual(
      [...READINESS_BANDS].sort(),
    );
    expect(READINESS_BAND_META.READY.label).toBe("Ready for Protection");
    expect(READINESS_BAND_META.NOT_READY.label).toBe("Not Ready");
  });
});
