import { describe, it, expect } from "vitest";
import {
  escalate,
  effectivePriority,
  dueOffsetDays,
  addDays,
  FACTOR_WORK_TYPE,
} from "@/lib/work/rules";
import {
  WORK_TYPES,
  WORK_TYPE_META,
  workTypeMeta,
} from "@/lib/work/work-type";
import { generateReadinessWork, generateAllWork } from "@/lib/work/generate";
import {
  todaysWork,
  activeWork,
  queueForDomain,
  countActiveWork,
} from "@/lib/work/projections";
import { MOCK_CUSTOMERS } from "@/lib/customers/mock";
import type { Customer } from "@/lib/customers/types";
import type { WorkItem } from "@/lib/work/types";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "CUS-TEST",
    fullName: "Test Person",
    email: "t@example.co.za",
    joinedAt: "2026-01-01T00:00:00.000Z",
    profileComplete: true,
    identityStatus: "VERIFIED",
    emergencyInfoComplete: true,
    emergencyContactsCount: 1,
    cardStatus: "ACTIVE",
    ...overrides,
  };
}

describe("work rules", () => {
  it("escalate climbs one level and caps at URGENT", () => {
    expect(escalate("LOW")).toBe("MEDIUM");
    expect(escalate("HIGH")).toBe("URGENT");
    expect(escalate("URGENT")).toBe("URGENT");
  });

  it("effectivePriority escalates only when unprotected", () => {
    expect(effectivePriority("HIGH", { unprotected: false })).toBe("HIGH");
    expect(effectivePriority("HIGH", { unprotected: true })).toBe("URGENT");
  });

  it("dueOffsetDays + addDays derive a due date deterministically", () => {
    expect(dueOffsetDays("URGENT")).toBe(0);
    expect(dueOffsetDays("LOW")).toBe(7);
    expect(addDays("2026-06-26T09:00:00.000Z", 3)).toBe(
      "2026-06-29T09:00:00.000Z",
    );
  });

  it("every readiness factor maps to a valid work type", () => {
    for (const type of Object.values(FACTOR_WORK_TYPE)) {
      expect(WORK_TYPE_META[type]).toBeDefined();
    }
  });
});

describe("work type metadata", () => {
  it("covers every type and binds each to a domain", () => {
    expect(Object.keys(WORK_TYPE_META).sort()).toEqual([...WORK_TYPES].sort());
    for (const t of WORK_TYPES) {
      expect(workTypeMeta(t).label.length).toBeGreaterThan(0);
      expect(workTypeMeta(t).domain).toBeTruthy();
    }
  });
});

describe("work generation from readiness gaps", () => {
  it("generates nothing for a fully-ready, protected customer", () => {
    expect(generateReadinessWork(customer())).toEqual([]);
  });

  it("generates one item per unmet factor", () => {
    const empty = customer({
      profileComplete: false,
      identityStatus: "UNVERIFIED",
      emergencyInfoComplete: false,
      emergencyContactsCount: 0,
      cardStatus: "NONE",
    });
    const work = generateReadinessWork(empty);
    expect(work).toHaveLength(5);
    expect(work.every((w) => w.source === "READINESS_GAP")).toBe(true);
    expect(work.every((w) => w.customerId === empty.id)).toBe(true);
  });

  it("escalates protective work for unprotected customers", () => {
    const empty = customer({
      identityStatus: "UNVERIFIED",
      emergencyInfoComplete: false,
      cardStatus: "NONE",
      profileComplete: false,
      emergencyContactsCount: 0,
    });
    const identity = generateReadinessWork(empty).find(
      (w) => w.type === "VERIFY_IDENTITY",
    );
    // base HIGH escalated to URGENT because the customer is unprotected
    expect(identity?.priority).toBe("URGENT");
    expect(identity?.domain).toBe("IDENTITY");
  });

  it("reflects identity submission state in the work status", () => {
    const pending = generateReadinessWork(
      customer({ identityStatus: "PENDING", cardStatus: "NONE" }),
    ).find((w) => w.type === "VERIFY_IDENTITY");
    expect(pending?.status).toBe("IN_PROGRESS");
  });
});

describe("projections (queues are filtered views of work)", () => {
  const all = generateAllWork(MOCK_CUSTOMERS);

  it("todaysWork excludes terminal work, orders by urgency, and limits", () => {
    const items: WorkItem[] = [
      { ...all[0]!, id: "a", priority: "LOW", status: "OPEN" },
      { ...all[0]!, id: "b", priority: "URGENT", status: "OPEN" },
      { ...all[0]!, id: "c", priority: "HIGH", status: "DONE" },
    ];
    const result = todaysWork(items);
    expect(result.map((w) => w.id)).toEqual(["b", "a"]); // DONE dropped, urgent first
    expect(todaysWork(items, 1)).toHaveLength(1);
  });

  it("activeWork returns only one customer's active work", () => {
    const id = "CUS-2044"; // Grace — unprotected, several gaps
    const work = activeWork(all, id);
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((w) => w.customerId === id)).toBe(true);
    expect(countActiveWork(all, id)).toBe(work.length);
  });

  it("the Identity queue is the IDENTITY-domain projection", () => {
    const queue = queueForDomain(all, "IDENTITY");
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((w) => w.domain === "IDENTITY")).toBe(true);
    expect(queue.every((w) => w.type === "VERIFY_IDENTITY")).toBe(true);
  });
});
