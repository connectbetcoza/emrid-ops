import { describe, it, expect } from "vitest";
import {
  protectionStatus,
  readinessForCustomer,
  customerReadinessFactors,
} from "@/lib/customers/readiness";
import {
  needsAttention,
  readinessDistribution,
  readinessTotal,
  searchCustomers,
} from "@/lib/customers/queries";
import { MOCK_CUSTOMERS } from "@/lib/customers/mock";
import type { Customer } from "@/lib/customers/types";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "CUS-TEST",
    fullName: "Test Person",
    email: "test@example.co.za",
    joinedAt: "2026-01-01T00:00:00.000Z",
    profileComplete: true,
    identityStatus: "VERIFIED",
    emergencyInfoComplete: true,
    emergencyContactsCount: 1,
    cardStatus: "ACTIVE",
    ...overrides,
  };
}

describe("customer readiness bridge", () => {
  it("factor weights sum to 100", () => {
    const total = customerReadinessFactors(customer()).reduce(
      (s, f) => s + f.weight,
      0,
    );
    expect(total).toBe(100);
  });

  it("a fully-complete customer is 100% / Ready", () => {
    const r = readinessForCustomer(customer());
    expect(r.score).toBe(100);
    expect(r.band).toBe("READY");
  });

  it("an empty customer is 0% / Not Ready", () => {
    const r = readinessForCustomer(
      customer({
        profileComplete: false,
        identityStatus: "UNVERIFIED",
        emergencyInfoComplete: false,
        emergencyContactsCount: 0,
        cardStatus: "NONE",
      }),
    );
    expect(r.score).toBe(0);
    expect(r.band).toBe("NOT_READY");
  });

  it("ready-but-no-card scores high yet is not protected", () => {
    const c = customer({ cardStatus: "NONE" }); // missing only the 15-weight card
    expect(readinessForCustomer(c).score).toBe(85);
    expect(readinessForCustomer(c).band).toBe("READY");
    expect(protectionStatus(c)).toBe("IN_PROGRESS");
  });
});

describe("protectionStatus", () => {
  it("PROTECTED needs active card + verified identity + emergency info", () => {
    expect(protectionStatus(customer())).toBe("PROTECTED");
  });

  it("UNPROTECTED when nothing protective is in place", () => {
    expect(
      protectionStatus(
        customer({
          identityStatus: "UNVERIFIED",
          emergencyInfoComplete: false,
          cardStatus: "NONE",
        }),
      ),
    ).toBe("UNPROTECTED");
  });

  it("IN_PROGRESS in between", () => {
    expect(
      protectionStatus(customer({ cardStatus: "PENDING" })),
    ).toBe("IN_PROGRESS");
  });
});

describe("customer queries", () => {
  it("readinessDistribution counts every customer once", () => {
    const dist = readinessDistribution(MOCK_CUSTOMERS);
    expect(readinessTotal(dist)).toBe(MOCK_CUSTOMERS.length);
  });

  it("needsAttention returns lowest readiness first, limited", () => {
    const top = needsAttention(MOCK_CUSTOMERS, 3);
    expect(top).toHaveLength(3);
    const scores = top.map((c) => readinessForCustomer(c).score);
    expect(scores[0]).toBeLessThanOrEqual(scores[1]!);
    expect(scores[1]).toBeLessThanOrEqual(scores[2]!);
  });

  it("searchCustomers matches name/email/location/id, empty → all", () => {
    expect(searchCustomers(MOCK_CUSTOMERS, "")).toHaveLength(
      MOCK_CUSTOMERS.length,
    );
    expect(searchCustomers(MOCK_CUSTOMERS, "thandi").map((c) => c.id)).toEqual([
      "CUS-2041",
    ]);
    expect(searchCustomers(MOCK_CUSTOMERS, "cape town").length).toBeGreaterThan(
      1,
    );
  });
});
