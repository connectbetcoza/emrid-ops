import { describe, it, expect } from "vitest";
import { workActions } from "@/lib/work/actions";
import { WORK_TYPES } from "@/lib/work/work-type";
import type { WorkStatus } from "@/lib/work/status";

describe("workActions (generic, type-agnostic)", () => {
  it("OPEN and IN_PROGRESS expose exactly one primary forward action", () => {
    for (const type of WORK_TYPES) {
      for (const status of ["OPEN", "IN_PROGRESS"] as WorkStatus[]) {
        const actions = workActions({ type, status });
        expect(actions.filter((a) => a.kind === "primary")).toHaveLength(1);
        expect(actions.find((a) => a.kind === "primary")?.advances).toBe(true);
      }
    }
  });

  it("WAITING/BLOCKED expose only the recovery action", () => {
    expect(workActions({ type: "VERIFY_IDENTITY", status: "WAITING" })).toEqual([
      { id: "resume", label: "Resume", toStatus: "IN_PROGRESS", kind: "secondary" },
    ]);
    expect(workActions({ type: "ISSUE_CARD", status: "BLOCKED" })).toEqual([
      { id: "unblock", label: "Unblock", toStatus: "IN_PROGRESS", kind: "secondary" },
    ]);
  });

  it("terminal statuses offer only Reopen", () => {
    for (const status of ["DONE", "CANCELLED"] as WorkStatus[]) {
      const actions = workActions({ type: "VERIFY_IDENTITY", status });
      expect(actions).toHaveLength(1);
      expect(actions[0]!.id).toBe("reopen");
      expect(actions[0]!.toStatus).toBe("OPEN");
    }
  });

  it("IN_PROGRESS offers Block as a danger action", () => {
    const actions = workActions({ type: "VERIFY_IDENTITY", status: "IN_PROGRESS" });
    expect(actions.some((a) => a.id === "block" && a.kind === "danger")).toBe(true);
  });

  it("Identity (single-step) approves from OPEN", () => {
    const primary = workActions({ type: "VERIFY_IDENTITY", status: "OPEN" }).find(
      (a) => a.kind === "primary",
    );
    expect(primary?.label).toBe("Approve identity");
    expect(primary?.toStatus).toBe("DONE");
  });

  it("Card Fulfilment (multi-step) progresses encode → dispatch by step", () => {
    const labelAt = (step: number, status: WorkStatus) =>
      workActions({ type: "ISSUE_CARD", status, step }).find(
        (a) => a.kind === "primary",
      );

    const s0 = labelAt(0, "OPEN");
    expect(s0?.label).toBe("Start encoding");
    expect(s0?.toStatus).toBe("IN_PROGRESS");

    const s1 = labelAt(1, "IN_PROGRESS");
    expect(s1?.label).toBe("Mark encoded");
    expect(s1?.toStatus).toBe("IN_PROGRESS");

    const s2 = labelAt(2, "IN_PROGRESS");
    expect(s2?.label).toBe("Mark dispatched");
    expect(s2?.toStatus).toBe("DONE");

    // past the last step, no further forward action
    expect(labelAt(3, "IN_PROGRESS")).toBeUndefined();
  });
});
