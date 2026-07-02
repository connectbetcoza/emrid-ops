import { beforeEach, describe, it, expect } from "vitest";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { DynamoDeviceRepository } from "@/lib/data/aws/device-repository";
import { resetStore } from "@/lib/data/mock/store";
import {
  getAggregateRepository,
  getAuditRepository,
  getDeviceRepository,
  getEmergencyProfileRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { executeTransition } from "@/lib/work/transition-service";
import { workActions } from "@/lib/work/actions";
import { protectionStatus, readinessForCustomer } from "@/lib/customers/readiness";
import { getCustomerState } from "@/lib/customers/state";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type { WorkItemRecord } from "@/lib/data/work-record";

beforeEach(() => resetStore());

// ── Mock DeviceRepository ─────────────────────────────────────────────────────

describe("MockDeviceRepository", () => {
  it("lists a seeded device and resolves by token", async () => {
    const repo = new MockDeviceRepository();
    const active = await repo.listForCustomer("CUS-2043"); // Aisha — fixture ACTIVE
    expect(active[0]?.status).toBe("ACTIVE");
    expect((await repo.getByToken("tok-CUS-2043"))?.profileId).toBe("CUS-2043");
  });

  it("markCardActive issues a card when none exists", async () => {
    const repo = new MockDeviceRepository();
    expect(await repo.listForCustomer("CUS-2041")).toHaveLength(0); // Thandi — no card
    const device = await repo.markCardActive("CUS-2041");
    expect(device.status).toBe("ACTIVE");
    expect((await repo.listForCustomer("CUS-2041"))[0]?.status).toBe("ACTIVE");
  });

  it("markCardActive activates an existing pending card", async () => {
    const repo = new MockDeviceRepository();
    expect((await repo.listForCustomer("CUS-2042"))[0]?.status).toBe("PENDING"); // Sipho
    const device = await repo.markCardActive("CUS-2042");
    expect(device.status).toBe("ACTIVE");
  });
});

// ── Dynamo DeviceRepository (fake doc.send) ───────────────────────────────────

function fakeDeps(respond: (name: string) => unknown): {
  deps: DynamoDeps;
  sent: { name: string; input: Record<string, unknown> }[];
} {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const deps: DynamoDeps = {
    table: "emrid-test",
    doc: {
      send: (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        return respond(command.constructor.name);
      }) as DynamoDeps["doc"]["send"],
    },
  };
  return { deps, sent };
}

describe("DynamoDeviceRepository", () => {
  it("getByToken queries GSI1 (exact-match, no scan)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoDeviceRepository(deps).getByToken("abc");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.IndexName).toBe("GSI1");
    expect(q.input.ExpressionAttributeValues).toMatchObject({ ":pk": "TOKEN#abc" });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("markCardActive issues a new card via dual-write Put", async () => {
    const { deps, sent } = fakeDeps((name) => (name === "QueryCommand" ? { Items: [] } : {}));
    await new DynamoDeviceRepository(deps).markCardActive("CUS-X");
    const tx = sent.find((c) => c.name === "TransactWriteCommand")!;
    const items = tx.input.TransactItems as Array<Record<string, any>>;
    const puts = items.filter((i) => i.Put).map((i) => i.Put.Item);
    expect(puts.some((it) => String(it.PK).startsWith("DEVICE#"))).toBe(true);
    expect(puts.some((it) => it.PK === "PROFILE#CUS-X")).toBe(true);
    expect(puts.every((it) => it.status === "ACTIVE")).toBe(true);
  });
});

// ── The First Protected Life journey (Ops side, mock) ─────────────────────────

describe("First Protected Life (mock): approve identity then fulfil card → Protected", () => {
  it("a Ready customer becomes Protected at 100% readiness", async () => {
    const deps = {
      workRepo: getWorkItemRepository(),
      profileRepo: getProfileRepository(),
      deviceRepo: getDeviceRepository(),
      auditRepo: getAuditRepository(),
      emergencyRepo: getEmergencyProfileRepository(),
      aggregateRepo: getAggregateRepository(),
    };
    const id = "CUS-2041"; // Thandi: identity PENDING, emergency ok, contacts ok, no card
    const protectedBefore = (await deps.aggregateRepo.getProtectedLives())
      .protectedCount;

    // Step 8 — approve identity (still IN_PROGRESS — no card yet, no crossing).
    const idWork = (await deps.workRepo.listByDomain("IDENTITY")).find(
      (w) => w.customerId === id,
    )!;
    await executeTransition(deps, { current: idWork, toStatus: "DONE", actorId: "ops-1" });
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(
      protectedBefore,
    );

    // Steps 9–10 — the ISSUE_CARD work reaches DONE. NOTE: the Ops UI can no
    // longer produce DONE (dispatch parks the item WAITING); DONE here simulates
    // the CUSTOMER'S REAL ACTIVATION completing the work — the system transition
    // that is the only legitimate trigger of CARD_ACTIVATION.
    const cardWork = (await deps.workRepo.listByDomain("FULFILMENT")).find(
      (w) => w.customerId === id,
    )!;
    await executeTransition(deps, { current: cardWork, toStatus: "DONE", actorId: "ops-1" });

    // Step 11 — Protected.
    const customer = (await getCustomerState(id))!;
    expect(customer.identityStatus).toBe("VERIFIED");
    expect(customer.cardStatus).toBe("ACTIVE");
    expect(protectionStatus(customer)).toBe("PROTECTED");
    expect(readinessForCustomer(customer).score).toBe(100);

    // The aggregate moved exactly once, on the boundary-crossing card activation.
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(
      protectedBefore + 1,
    );

    // Audit recorded both Ops actions for the customer.
    const events = await deps.auditRepo.listForProfile(id);
    expect(events.map((e) => e.eventType).sort()).toEqual(
      ["CARD_ACTIVATED", "IDENTITY_VERIFIED"].sort(),
    );
  });
});

// ── Operational truth: Ops dispatch must never activate the card ──────────────

describe("Fulfilment dispatch does NOT activate the card or protect the customer", () => {
  it("walking every Ops step ends WAITING with the device still PENDING", async () => {
    const deps = {
      workRepo: getWorkItemRepository(),
      profileRepo: getProfileRepository(),
      deviceRepo: getDeviceRepository(),
      auditRepo: getAuditRepository(),
      emergencyRepo: getEmergencyProfileRepository(),
      aggregateRepo: getAggregateRepository(),
    };
    // Sipho: identity VERIFIED, emergency ok, card PENDING (device seeded).
    const id = "CUS-2042";
    const protectedBefore = (await deps.aggregateRepo.getProtectedLives())
      .protectedCount;

    let record: WorkItemRecord = (
      await deps.workRepo.listByDomain("FULFILMENT")
    ).find((w) => w.customerId === id)!;

    // Take the primary forward action until none remains — the full Ops flow.
    for (let guard = 0; guard < 10; guard++) {
      const primary = workActions({
        type: record.workType,
        status: record.status,
        step: record.step,
      }).find((a) => a.kind === "primary" && a.advances);
      if (!primary) break;

      // No Ops click may ever complete activation.
      expect(primary.toStatus).not.toBe("DONE");

      const res = await executeTransition(deps, {
        current: record,
        toStatus: primary.toStatus,
        step: record.step + 1,
        actorId: "ops-1",
      });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(res.error);
      record = res.record;
    }

    // Parked awaiting the CUSTOMER's real activation.
    expect(record.status).toBe("WAITING");

    // The device was never activated by Ops.
    const devices = await deps.deviceRepo.listForCustomer(id);
    expect(devices[0]?.status).toBe("PENDING");

    // The customer is NOT protected, and the north-star figure did not move.
    const customer = (await getCustomerState(id))!;
    expect(customer.cardStatus).toBe("PENDING");
    expect(protectionStatus(customer)).not.toBe("PROTECTED");
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(
      protectedBefore,
    );
  });
});
