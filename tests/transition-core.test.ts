import { describe, it, expect } from "vitest";
import { planTransition } from "@/lib/work/transition-core";

describe("planTransition (work transition → shared write)", () => {
  it("approving identity verifies the customer", () => {
    expect(planTransition({ type: "VERIFY_IDENTITY", toStatus: "DONE" })).toEqual({
      kind: "IDENTITY_DECISION",
      decision: "VERIFIED",
    });
  });

  it("other identity transitions are audit-only", () => {
    expect(planTransition({ type: "VERIFY_IDENTITY", toStatus: "WAITING" }).kind).toBe(
      "AUDIT_ONLY",
    );
    expect(planTransition({ type: "VERIFY_IDENTITY", toStatus: "BLOCKED" }).kind).toBe(
      "AUDIT_ONLY",
    );
  });

  it("completing card fulfilment activates the card", () => {
    expect(planTransition({ type: "ISSUE_CARD", toStatus: "DONE" })).toEqual({
      kind: "CARD_ACTIVATION",
    });
    expect(planTransition({ type: "ISSUE_CARD", toStatus: "IN_PROGRESS" }).kind).toBe(
      "AUDIT_ONLY",
    );
  });

  it("readiness/support tracking work is audit-only (the truth lives with the Patient data)", () => {
    for (const type of [
      "COMPLETE_PROFILE",
      "ADD_EMERGENCY_INFO",
      "ADD_EMERGENCY_CONTACT",
      "RESOLVE_SUPPORT_QUERY",
    ] as const) {
      expect(planTransition({ type, toStatus: "DONE" }).kind).toBe("AUDIT_ONLY");
      expect(planTransition({ type, toStatus: "WAITING" }).kind).toBe("AUDIT_ONLY");
    }
  });

  it("practitioner approval records the decision (defaulting to APPROVED)", () => {
    expect(planTransition({ type: "APPROVE_PRACTITIONER", toStatus: "DONE" })).toEqual({
      kind: "PRACTITIONER_DECISION",
      decision: "APPROVED",
    });
    expect(
      planTransition({
        type: "APPROVE_PRACTITIONER",
        toStatus: "DONE",
        decision: "REJECTED",
      }),
    ).toEqual({ kind: "PRACTITIONER_DECISION", decision: "REJECTED" });
    expect(
      planTransition({ type: "APPROVE_PRACTITIONER", toStatus: "WAITING" }).kind,
    ).toBe("AUDIT_ONLY");
  });
});
