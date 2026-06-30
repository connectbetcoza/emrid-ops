import { describe, it, expect } from "vitest";
import {
  STATUS_META,
  WORK_STATUSES,
  statusMeta,
  type WorkStatus,
} from "@/lib/work/status";

describe("work status metadata", () => {
  it("has metadata for every status in the union", () => {
    // WORK_STATUSES is the display-ordered mirror of the union; every entry
    // must resolve, and the map must not carry extras.
    for (const status of WORK_STATUSES) {
      expect(STATUS_META[status]).toBeDefined();
      expect(statusMeta(status).label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(STATUS_META).sort()).toEqual([...WORK_STATUSES].sort());
  });

  it("maps lifecycle states to sensible tones", () => {
    expect(statusMeta("DONE").tone).toBe("success");
    expect(statusMeta("BLOCKED").tone).toBe("danger");
    expect(statusMeta("WAITING").tone).toBe("warning");
    expect(statusMeta("IN_PROGRESS").tone).toBe("info");
  });

  it("WORK_STATUSES contains no duplicates", () => {
    const set = new Set<WorkStatus>(WORK_STATUSES);
    expect(set.size).toBe(WORK_STATUSES.length);
  });
});
