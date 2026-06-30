import { describe, it, expect } from "vitest";
import {
  PRIORITIES,
  PRIORITY_META,
  byPriorityDesc,
  priorityMeta,
} from "@/lib/work/priority";

describe("work priority metadata", () => {
  it("has metadata for every priority", () => {
    for (const p of PRIORITIES) {
      expect(PRIORITY_META[p]).toBeDefined();
      expect(priorityMeta(p).label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PRIORITY_META).sort()).toEqual([...PRIORITIES].sort());
  });

  it("ranks ascend from LOW to URGENT", () => {
    expect(priorityMeta("LOW").rank).toBeLessThan(priorityMeta("MEDIUM").rank);
    expect(priorityMeta("MEDIUM").rank).toBeLessThan(priorityMeta("HIGH").rank);
    expect(priorityMeta("HIGH").rank).toBeLessThan(priorityMeta("URGENT").rank);
  });

  it("PRIORITIES is ordered most-urgent first", () => {
    expect(PRIORITIES[0]).toBe("URGENT");
    expect(PRIORITIES[PRIORITIES.length - 1]).toBe("LOW");
  });

  it("byPriorityDesc sorts most-urgent first", () => {
    const sorted = ["LOW", "URGENT", "MEDIUM", "HIGH"].sort(
      byPriorityDesc as (a: string, b: string) => number,
    );
    expect(sorted).toEqual(["URGENT", "HIGH", "MEDIUM", "LOW"]);
  });
});
