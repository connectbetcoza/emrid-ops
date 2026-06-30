import { beforeEach, describe, it, expect } from "vitest";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import { DynamoWorkItemRepository } from "@/lib/data/aws/work-repository";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type { WorkItemRecord } from "@/lib/data/work-record";
import { executeTransition } from "@/lib/work/transition-service";
import {
  getAggregateRepository,
  getAuditRepository,
  getDeviceRepository,
  getEmergencyProfileRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { isActiveWork } from "@/lib/work/types";
import type { Profile } from "@/lib/data/entities";

beforeEach(() => resetStore());

// ── Fake DynamoDB (captures commands; no AWS, and crucially no Scan) ──────────

type Captured = { name: string; input: Record<string, unknown> };

function fakeDeps(
  respond: (name: string) => unknown,
): { deps: DynamoDeps; sent: Captured[] } {
  const sent: Captured[] = [];
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

const record: WorkItemRecord = {
  workItemId: "WI-1",
  customerId: "CUS-9",
  workType: "VERIFY_IDENTITY",
  workDomain: "IDENTITY",
  status: "OPEN",
  priority: "HIGH",
  step: 0,
  assignment: { assigneeName: null },
  source: "READINESS_GAP",
  title: "Verify identity",
  subjectName: "Test Customer",
  nextAction: "Review ID",
  dueAt: "2026-06-30T09:00:00.000Z",
  createdAt: "2026-06-26T09:00:00.000Z",
  updatedAt: "2026-06-26T09:00:00.000Z",
};

describe("Identity queue reads from Work Items, not profiles", () => {
  it("mock: listByDomain returns persisted identity work", async () => {
    const repo = new MockWorkItemRepository();
    const items = await repo.listByDomain("IDENTITY");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((w) => w.workDomain === "IDENTITY")).toBe(true);
    expect(items.every((w) => w.workType === "VERIFY_IDENTITY")).toBe(true);
  });

  it("dynamo: queries the WORK#<domain> partition — never a Scan, never a profile read", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoWorkItemRepository(deps).listByDomain("IDENTITY");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.ExpressionAttributeValues).toMatchObject({ ":pk": "WORK#IDENTITY" });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
    expect(sent.some((c) => c.name === "GetCommand")).toBe(false);
  });
});

describe("Customer Workspace Active Work reads from the customer work index", () => {
  it("dynamo: queries PROFILE#<customerId> for WORK# items (no scan)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoWorkItemRepository(deps).listForCustomer("CUS-9");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.ExpressionAttributeValues).toMatchObject({
      ":pk": "PROFILE#CUS-9",
      ":sk": "WORK#",
    });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });
});

describe("transition rewrites BOTH projection items consistently", () => {
  it("dynamo: one TransactWrite deletes + puts both the queue and customer items with the new status", async () => {
    const { deps, sent } = fakeDeps(() => ({}));
    await new DynamoWorkItemRepository(deps).transition(record, { toStatus: "DONE" });

    const tx = sent.find((c) => c.name === "TransactWriteCommand")!;
    const items = tx.input.TransactItems as Array<Record<string, any>>;
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);

    const puts = items.filter((i) => i.Put).map((i) => i.Put.Item);
    const deletes = items.filter((i) => i.Delete).map((i) => i.Delete.Key);

    // New queue + customer items carry the NEW status.
    expect(puts).toContainEqual(expect.objectContaining({ PK: "WORK#IDENTITY", SK: expect.stringContaining("STATUS#DONE#") }));
    expect(puts).toContainEqual(expect.objectContaining({ PK: "PROFILE#CUS-9", SK: "WORK#DONE#WI-1" }));
    // Old queue + customer items (old status) are deleted.
    expect(deletes).toContainEqual(expect.objectContaining({ PK: "WORK#IDENTITY", SK: expect.stringContaining("STATUS#OPEN#") }));
    expect(deletes).toContainEqual({ PK: "PROFILE#CUS-9", SK: "WORK#OPEN#WI-1" });
  });

  it("mock: both reads reflect the new status after transition", async () => {
    const repo = new MockWorkItemRepository();
    const before = (await repo.listByDomain("IDENTITY")).find((w) => w.status !== "DONE")!;
    await repo.transition(before, { toStatus: "DONE" });

    const inQueue = (await repo.listByDomain("IDENTITY")).find((w) => w.workItemId === before.workItemId)!;
    const inCustomer = (await repo.listForCustomer(before.customerId)).find((w) => w.workItemId === before.workItemId)!;
    expect(inQueue.status).toBe("DONE");
    expect(inCustomer.status).toBe("DONE");
  });
});

describe("executeTransition: approve identity → both items moved, profile verified, audit appended", () => {
  it("composes the dual write + identity decision + append-only audit", async () => {
    const workRepo = new MockWorkItemRepository();
    const profileRepo = new MockProfileRepository();
    const auditRepo = new MockAuditRepository();

    const work = (await workRepo.listByDomain("IDENTITY"))[0]!;
    // Seed a matching profile for the decision write.
    const profile: Profile = {
      profileId: work.customerId,
      emrid: "EMR-X",
      firstName: "Test",
      lastName: "Customer",
      dateOfBirth: "1990-01-01",
      status: "ACTIVE",
      verificationLevel: "UNVERIFIED",
      identityVerificationStatus: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockStore.profiles.set(profile.profileId, profile);

    const result = await executeTransition(
      {
        workRepo,
        profileRepo,
        auditRepo,
        deviceRepo: new MockDeviceRepository(),
        emergencyRepo: new MockEmergencyProfileRepository(),
        aggregateRepo: new MockAggregateRepository(),
      },
      { current: work, toStatus: "DONE", actorId: "ops-1" },
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.persistedDecision).toBe(true);
    // Profile verified
    expect((await profileRepo.getProfile(work.customerId))?.identityVerificationStatus).toBe("VERIFIED");
    // Work moved in both projections
    expect((await workRepo.listForCustomer(work.customerId)).find((w) => w.workItemId === work.workItemId)?.status).toBe("DONE");
    // Audit appended
    const events = await auditRepo.listForProfile(work.customerId);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("IDENTITY_VERIFIED");
  });
});

describe("Phase 3 seam via the factory (mock mode)", () => {
  it("approving identity persists everywhere and removes it from active projections", async () => {
    const workRepo = getWorkItemRepository();
    const before = (await workRepo.listByDomain("IDENTITY")).find(
      (w) => isActiveWork(w),
    )!;
    expect(before).toBeTruthy();

    const result = await executeTransition(
      {
        workRepo,
        profileRepo: getProfileRepository(),
        auditRepo: getAuditRepository(),
        deviceRepo: getDeviceRepository(),
        emergencyRepo: getEmergencyProfileRepository(),
        aggregateRepo: getAggregateRepository(),
      },
      { current: before, toStatus: "DONE", actorId: "ops-1" },
    );
    expect(result.ok).toBe(true);

    // Queue projection: the item is now DONE (drops out of the active view).
    const queue = await workRepo.listByDomain("IDENTITY");
    const moved = queue.find((w) => w.workItemId === before.workItemId)!;
    expect(moved.status).toBe("DONE");
    expect(queue.filter(isActiveWork).some((w) => w.workItemId === before.workItemId)).toBe(false);

    // Customer active-work index: no longer active for that customer.
    const customerWork = await workRepo.listForCustomer(before.customerId);
    expect(customerWork.filter(isActiveWork).some((w) => w.workItemId === before.workItemId)).toBe(false);

    // Profile verified (the shared-state write).
    expect(
      (await getProfileRepository().getProfile(before.customerId))?.identityVerificationStatus,
    ).toBe("VERIFIED");

    // No profile scan exists anywhere in this seam (assertion is structural:
    // the only profile access is keyed GetItem/UpdateItem in the repos).
  });
});
