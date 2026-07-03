import { beforeEach, describe, it, expect } from "vitest";
import { planTransition } from "@/lib/work/transition-core";
import { executeTransition } from "@/lib/work/transition-service";
import {
  producedWorkItemId,
  practitionerRefreshTarget,
  workIntentForChange,
} from "@/lib/work/producer-core";
import { produceFromStreamRecords } from "@/lib/work/producer";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockDirectoryRepository } from "@/lib/data/mock/directory-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { DynamoPractitionerRepository } from "@/lib/data/aws/practitioner-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { DynamoDeps } from "@/lib/data/aws/client";

const NOW = "2026-07-03T09:00:00.000Z";

beforeEach(() => resetStore());

function deps() {
  return {
    workRepo: new MockWorkItemRepository(),
    profileRepo: new MockProfileRepository(),
    deviceRepo: new MockDeviceRepository(),
    emergencyRepo: new MockEmergencyProfileRepository(),
    aggregateRepo: new MockAggregateRepository(),
    auditRepo: new MockAuditRepository(),
    directoryRepo: new MockDirectoryRepository(),
    practitionerRepo: new MockPractitionerRepository(),
  };
}

describe("practitioner approval — the full decision path (mock)", () => {
  it("APPROVE persists status, completes the work, audits PRACTITIONER_APPROVED", async () => {
    const d = deps();
    const work = (await d.workRepo.listByDomain("PRACTITIONER")).find(
      (w) => w.customerId === "prac-9001",
    )!;
    expect(work.status).toBe("OPEN");

    const result = await executeTransition(d, {
      current: work,
      toStatus: "DONE",
      step: 1,
      actorId: "ops-1",
      decision: "APPROVED",
      notes: "Registration verified with the HPCSA.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.persistedDecision).toBe(true);

    const practitioner = await d.practitionerRepo.getPractitioner("prac-9001");
    expect(practitioner?.status).toBe("APPROVED");
    expect(practitioner?.statusNotes).toBe("Registration verified with the HPCSA.");

    // Work item DONE in both projections; no active practitioner work remains.
    const after = await d.workRepo.listForCustomer("prac-9001");
    expect(after.find((w) => w.workItemId === work.workItemId)?.status).toBe("DONE");

    // Audit targets the practitioner's USER identity.
    const events = await d.auditRepo.listForTarget("USER", "prac-9001");
    expect(events[0]?.eventType).toBe("PRACTITIONER_APPROVED");
    expect(events[0]?.actorType).toBe("OPS");

    // The aggregate never moves for practitioner work.
    expect((await d.aggregateRepo.getProtectedLives()).version).toBe(0);
  });

  it("REJECT persists REJECTED + notes and audits PRACTITIONER_REJECTED", async () => {
    const d = deps();
    const work = (await d.workRepo.listByDomain("PRACTITIONER"))[0]!;
    const result = await executeTransition(d, {
      current: work,
      toStatus: "DONE",
      actorId: "ops-1",
      decision: "REJECTED",
      notes: "Registration number could not be verified.",
    });
    expect(result.ok).toBe(true);

    const practitioner = await d.practitionerRepo.getPractitioner("prac-9001");
    expect(practitioner?.status).toBe("REJECTED");
    expect(practitioner?.statusNotes).toBe("Registration number could not be verified.");
    const events = await d.auditRepo.listForTarget("USER", "prac-9001");
    expect(events[0]?.eventType).toBe("PRACTITIONER_REJECTED");
  });

  it("the generic row Approve (no explicit decision) defaults to APPROVED", () => {
    expect(planTransition({ type: "APPROVE_PRACTITIONER", toStatus: "DONE" })).toEqual(
      { kind: "PRACTITIONER_DECISION", decision: "APPROVED" },
    );
  });
});

describe("producer — practitioner registration creates the approval work", () => {
  const registrationRecord = {
    eventName: "INSERT",
    dynamodb: {
      Keys: { PK: { S: "PRACTITIONER#prac-NEW" }, SK: { S: "PRACTITIONER" } },
      NewImage: {
        practitionerId: { S: "prac-NEW" },
        userId: { S: "prac-NEW" },
        practiceId: { S: "prc-9001" },
        fullName: { S: "Dr. Naledi Khumalo" },
        email: { S: "naledi@rosebankfp.co.za" },
        status: { S: "PENDING" },
        createdAt: { S: NOW },
        updatedAt: { S: NOW },
      },
    },
  };

  it("creates APPROVE_PRACTITIONER with the name from the stream image", async () => {
    const d = deps();
    // Simulate the Patient write the stream reflects.
    mockStore.practitioners.set("prac-NEW", {
      practitionerId: "prac-NEW",
      userId: "prac-NEW",
      practiceId: "prc-9001",
      fullName: "Dr. Naledi Khumalo",
      email: "naledi@rosebankfp.co.za",
      status: "PENDING",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const results = await produceFromStreamRecords(d, [registrationRecord], NOW);
    expect(results[0]).toEqual({
      created: true,
      workItemId: "prac-NEW-practitioner",
    });
    const items = await d.workRepo.listForCustomer("prac-NEW");
    const created = items.find((w) => w.workItemId === "prac-NEW-practitioner")!;
    expect(created.workType).toBe("APPROVE_PRACTITIONER");
    expect(created.workDomain).toBe("PRACTITIONER");
    expect(created.subjectName).toBe("Dr. Naledi Khumalo");

    // Replay: no duplicate.
    const replay = await produceFromStreamRecords(d, [registrationRecord], NOW);
    expect(replay[0]).toMatchObject({ created: false, reason: "exists" });
  });

  it("intent + refresh-target pure mapping", () => {
    const change = {
      eventName: "INSERT" as const,
      keys: { PK: "PRACTITIONER#p-1", SK: "PRACTITIONER" },
      newImage: {
        practitionerId: "p-1",
        fullName: "Dr. X",
        status: "PENDING",
      },
      oldImage: null,
    };
    expect(workIntentForChange(change)).toEqual({
      workType: "APPROVE_PRACTITIONER",
      customerId: "p-1",
      subjectName: "Dr. X",
    });
    expect(practitionerRefreshTarget(change)).toBe("p-1");
    expect(
      practitionerRefreshTarget({ ...change, keys: { PK: "DIRECTORY", SK: "PRACTITIONER" } }),
    ).toBeNull();
    expect(
      producedWorkItemId({ workType: "APPROVE_PRACTITIONER", customerId: "p-1" }),
    ).toBe("p-1-practitioner");
  });
});

describe("practitioner directory + search source", () => {
  it("mock directory lists the seeded practitioner with practice name", async () => {
    const list = await new MockDirectoryRepository().listPractitioners();
    const botha = list.find((e) => e.practitionerId === "prac-9001")!;
    expect(botha.fullName).toBe("Dr. Johan Botha");
    expect(botha.practiceName).toBe("Rosebank Family Practice");
    expect(botha.status).toBe("PENDING");
  });
});

describe("linked patients (read-only access grants)", () => {
  it("mock: returns the practitioner's grants from the store", async () => {
    mockStore.practitionerAccess.set("prac-9001", [
      {
        accessId: "acc-1",
        practitionerId: "prac-9001",
        profileId: "CUS-2043",
        grantedAt: "2026-06-28T08:00:00.000Z",
        status: "ACTIVE",
      },
    ]);
    const grants = await new MockPractitionerRepository().listPatientAccess("prac-9001");
    expect(grants).toHaveLength(1);
    expect(grants[0]!.profileId).toBe("CUS-2043");
  });
});

describe("DynamoPractitionerRepository", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fakeDeps(respond: (name: string) => unknown): {
    deps: DynamoDeps;
    sent: Captured[];
  } {
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

  it("getPractitioner is a point read on PRACTITIONER#<id> (no scan)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Item: undefined }));
    await new DynamoPractitionerRepository(deps).getPractitioner("p-1");
    expect(sent[0]!.name).toBe("GetCommand");
    expect(sent[0]!.input.Key).toEqual({ PK: "PRACTITIONER#p-1", SK: "PRACTITIONER" });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("listPatientAccess queries the PRACTITIONER# partition for PATIENT# grants (no scan)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoPractitionerRepository(deps).listPatientAccess("p-1");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.ExpressionAttributeValues).toMatchObject({
      ":pk": "PRACTITIONER#p-1",
      ":sk": "PATIENT#",
    });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("setApprovalDecision is a conditional UpdateItem writing status + statusNotes", async () => {
    const { deps, sent } = fakeDeps(() => ({
      Attributes: {
        practitionerId: "p-1", userId: "p-1", practiceId: "prc-1",
        fullName: "Dr. X", email: "x@y.z", status: "REJECTED",
        statusNotes: "No registration", createdAt: NOW, updatedAt: NOW,
      },
    }));
    const updated = await new DynamoPractitionerRepository(deps).setApprovalDecision(
      "p-1",
      { decision: "REJECTED", notes: "No registration", decidedByOpsUserId: "ops-1" },
    );
    const update = sent.find((c) => c.name === "UpdateCommand")!;
    expect(update.input.ConditionExpression).toBe("attribute_exists(PK)");
    const values = update.input.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[":status"]).toBe("REJECTED");
    expect(values[":notes"]).toBe("No registration");
    expect(updated.status).toBe("REJECTED");
  });
});

// ── Practitioner Management v1 (internal onboarding + account updates) ────────

import {
  credentialsPending,
  searchPractitioners,
  validateOnboarding,
} from "@/lib/practitioners/manage-core";

describe("manage-core (pure)", () => {
  const valid = {
    fullName: "Dr Michael Edwards",
    email: "michael@edwardsfp.co.za",
    practiceName: "Edwards Family Practice",
    practiceEmail: "reception@edwardsfp.co.za",
  };

  it("accepts a valid onboarding input", () => {
    expect(validateOnboarding(valid)).toBeNull();
  });

  it("rejects missing name / bad emails", () => {
    expect(validateOnboarding({ ...valid, fullName: " " })).toMatch(/name/i);
    expect(validateOnboarding({ ...valid, email: "nope" })).toMatch(/email/i);
    expect(validateOnboarding({ ...valid, practiceName: "" })).toMatch(/practice name/i);
    expect(validateOnboarding({ ...valid, practiceEmail: "x" })).toMatch(/practice email/i);
  });

  it("marks generated ids as credentials-pending; Cognito subs as linked", () => {
    expect(credentialsPending("prac_1234")).toBe(true);
    expect(credentialsPending("8f14e45f-ceea-4a7b-9c65-...")).toBe(false);
  });

  it("searches by name, email, and practice", () => {
    const entries = [
      {
        practitionerId: "p1", fullName: "Dr Michael Edwards",
        email: "michael@edwardsfp.co.za", practiceId: "prc-1",
        practiceName: "Edwards Family Practice", status: "APPROVED" as const,
        registeredAt: "x", updatedAt: "x",
      },
      {
        practitionerId: "p2", fullName: "Dr Johan Botha",
        email: "johan@rosebankfp.co.za", practiceId: "prc-2",
        practiceName: "Rosebank Family Practice", status: "PENDING" as const,
        registeredAt: "x", updatedAt: "x",
      },
    ];
    expect(searchPractitioners(entries, "edwards")).toHaveLength(1);
    expect(searchPractitioners(entries, "rosebank")[0]?.practitionerId).toBe("p2");
    expect(searchPractitioners(entries, "")).toHaveLength(2);
  });
});

describe("internal onboarding + account management (mock repo)", () => {
  it("creates practice + ACTIVE practitioner, idempotent on id", async () => {
    const repo = new MockPractitionerRepository();
    const practice = await repo.createPractice({
      practiceId: "prc-me", name: "Edwards Family Practice",
      email: "reception@edwardsfp.co.za",
    });
    const created = await repo.createPractitioner({
      practitionerId: "prac_me", practiceId: practice.practiceId,
      fullName: "Dr Michael Edwards", email: "michael@edwardsfp.co.za",
      status: "APPROVED",
    });
    expect(created.status).toBe("APPROVED"); // ACTIVE by default in V1
    // Idempotent replay returns the existing record.
    const replay = await repo.createPractitioner({
      practitionerId: "prac_me", practiceId: practice.practiceId,
      fullName: "SOMEONE ELSE", email: "x@y.z", status: "PENDING",
    });
    expect(replay.fullName).toBe("Dr Michael Edwards");
  });

  it("updates account particulars + practice details", async () => {
    const repo = new MockPractitionerRepository();
    const updated = await repo.updatePractitionerAccount("prac-9001", {
      registrationNumber: "MP-9999999",
      status: "SUSPENDED",
    });
    expect(updated.registrationNumber).toBe("MP-9999999");
    expect(updated.status).toBe("SUSPENDED");
    const practice = await repo.updatePractice("prc-9001", { phone: "+27 11 000 0000" });
    expect(practice.phone).toBe("+27 11 000 0000");
  });
});

describe("management writes (dynamo command shapes)", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fake(respond: (name: string) => unknown): { deps: DynamoDeps; sent: Captured[] } {
    const sent: Captured[] = [];
    const deps: DynamoDeps = {
      table: "emrid-test",
      doc: {
        send: (async (c: { constructor: { name: string }; input: Record<string, unknown> }) => {
          sent.push({ name: c.constructor.name, input: c.input });
          return respond(c.constructor.name);
        }) as DynamoDeps["doc"]["send"],
      },
    };
    return { deps, sent };
  }

  it("createPractitioner is a conditional Put (attribute_not_exists)", async () => {
    const { deps, sent } = fake(() => ({}));
    await new DynamoPractitionerRepository(deps).createPractitioner({
      practitionerId: "prac_x", practiceId: "prc-x",
      fullName: "Dr X", email: "x@y.z", status: "APPROVED",
    });
    const put = sent.find((c) => c.name === "PutCommand")!;
    expect(put.input.ConditionExpression).toBe("attribute_not_exists(PK)");
    const item = put.input.Item as Record<string, unknown>;
    expect(item.PK).toBe("PRACTITIONER#prac_x");
    expect(item.status).toBe("APPROVED");
  });

  it("updatePractitionerAccount only sets provided fields (conditional exists)", async () => {
    const { deps, sent } = fake(() => ({
      Attributes: {
        practitionerId: "p1", userId: "p1", practiceId: "prc-1",
        fullName: "Dr X", email: "x@y.z", status: "SUSPENDED",
        createdAt: "t", updatedAt: "t",
      },
    }));
    await new DynamoPractitionerRepository(deps).updatePractitionerAccount("p1", {
      status: "SUSPENDED",
    });
    const upd = sent.find((c) => c.name === "UpdateCommand")!;
    expect(upd.input.ConditionExpression).toBe("attribute_exists(PK)");
    expect(String(upd.input.UpdateExpression)).toContain("#s = :st");
    expect(String(upd.input.UpdateExpression)).not.toContain("fullName");
  });
});

// ── Login linking (the credentials step: re-key `prac_` record → Cognito sub) ─

import { validateLoginLink } from "@/lib/practitioners/manage-core";
import { DynamoDirectoryRepository } from "@/lib/data/aws/directory-repository";

describe("login link validation (pure)", () => {
  it("accepts an unlinked record + a real sub", () => {
    expect(validateLoginLink("prac_1", "9c2f1e0a-sub")).toBeNull();
  });

  it("rejects already-linked records, blank ids, and generated ids", () => {
    expect(validateLoginLink("9c2f1e0a-sub", "other-sub")).toMatch(/already/i);
    expect(validateLoginLink("prac_1", "   ")).toMatch(/required/i);
    expect(validateLoginLink("prac_1", "prac_2")).toMatch(/generated/i);
    expect(validateLoginLink("prac_1", "prac_1")).toMatch(/generated/i);
  });
});

describe("login linking (mock repo)", () => {
  it("re-keys the record + grants to the sub; the old id is gone", async () => {
    const repo = new MockPractitionerRepository();
    await repo.createPractitioner({
      practitionerId: "prac_1",
      practiceId: "prc-1",
      fullName: "Dr. Michael Edwards",
      email: "dr@edwardsfp.co.za",
      status: "APPROVED",
    });
    mockStore.practitionerAccess.set("prac_1", [
      {
        accessId: "acc-1",
        practitionerId: "prac_1",
        profileId: "p-9",
        grantedAt: NOW,
        status: "ACTIVE",
      },
    ]);

    const linked = await repo.linkPractitionerLogin("prac_1", "sub-123");
    expect(linked.practitionerId).toBe("sub-123");
    expect(linked.userId).toBe("sub-123");
    expect(linked.fullName).toBe("Dr. Michael Edwards");
    expect(await repo.getPractitioner("prac_1")).toBeNull();
    expect(await repo.getPractitioner("sub-123")).toMatchObject({
      status: "APPROVED",
    });
    expect(await repo.listPatientAccess("sub-123")).toMatchObject([
      { practitionerId: "sub-123", profileId: "p-9", status: "ACTIVE" },
    ]);
    expect(await repo.listPatientAccess("prac_1")).toEqual([]);
  });

  it("refuses a taken id and a missing source", async () => {
    const repo = new MockPractitionerRepository();
    await repo.createPractitioner({
      practitionerId: "prac_1",
      practiceId: "prc-1",
      fullName: "A",
      email: "a@b.c",
      status: "APPROVED",
    });
    await repo.createPractitioner({
      practitionerId: "sub-taken",
      practiceId: "prc-1",
      fullName: "B",
      email: "b@c.d",
      status: "APPROVED",
    });
    await expect(
      repo.linkPractitionerLogin("prac_1", "sub-taken"),
    ).rejects.toThrow(/already exists/i);
    await expect(
      repo.linkPractitionerLogin("prac_missing", "sub-9"),
    ).rejects.toThrow(/not found/i);
  });
});

describe("login linking (dynamo command shapes)", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fake(respond: (name: string, nth: number) => unknown): {
    deps: DynamoDeps;
    sent: Captured[];
  } {
    const sent: Captured[] = [];
    const deps: DynamoDeps = {
      table: "emrid-test",
      doc: {
        send: (async (c: { constructor: { name: string }; input: Record<string, unknown> }) => {
          sent.push({ name: c.constructor.name, input: c.input });
          return respond(c.constructor.name, sent.length - 1);
        }) as DynamoDeps["doc"]["send"],
      },
    };
    return { deps, sent };
  }

  const stored = {
    practitionerId: "prac_1",
    userId: "prac_1",
    practiceId: "prc-1",
    fullName: "Dr. Michael Edwards",
    email: "dr@edwardsfp.co.za",
    status: "APPROVED",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };

  it("re-keys record + grant pairs in ONE TransactWriteItems (conditional new Put)", async () => {
    const { deps, sent } = fake((name, nth) => {
      if (name === "GetCommand") {
        // 1st get: the source record; 2nd get: the target id (free).
        return nth === 0 ? { Item: stored } : { Item: undefined };
      }
      if (name === "QueryCommand") {
        return {
          Items: [
            {
              accessId: "acc-1",
              practitionerId: "prac_1",
              profileId: "p-9",
              grantedAt: "2026-06-02T00:00:00.000Z",
              status: "ACTIVE",
            },
          ],
        };
      }
      return {};
    });

    const linked = await new DynamoPractitionerRepository(deps).linkPractitionerLogin(
      "prac_1",
      "sub-123",
    );
    expect(linked.practitionerId).toBe("sub-123");
    expect(linked.createdAt).toBe(stored.createdAt); // history preserved

    const transacts = sent.filter((c) => c.name === "TransactWriteCommand");
    expect(transacts).toHaveLength(1);
    const items = transacts[0]!.input.TransactItems as Array<
      Record<string, { Item?: Record<string, unknown>; Key?: Record<string, unknown>; ConditionExpression?: string }>
    >;
    expect(items).toHaveLength(6); // 2 practitioner ops + 4 grant ops

    // New record: conditional create under the sub, identity fields re-keyed.
    expect(items[0]!.Put!.ConditionExpression).toBe("attribute_not_exists(PK)");
    expect(items[0]!.Put!.Item).toMatchObject({
      PK: "PRACTITIONER#sub-123",
      SK: "PRACTITIONER",
      practitionerId: "sub-123",
      userId: "sub-123",
      createdAt: stored.createdAt,
    });
    // Old record deleted.
    expect(items[1]!.Delete!.Key).toEqual({
      PK: "PRACTITIONER#prac_1",
      SK: "PRACTITIONER",
    });
    // Grant pair rewritten under the sub (both key directions, Patient shape).
    expect(items[2]!.Put!.Item).toMatchObject({
      PK: "PRACTITIONER#sub-123",
      SK: "PATIENT#p-9",
      type: "PRACTITIONER_ACCESS",
      practitionerId: "sub-123",
    });
    expect(items[3]!.Put!.Item).toMatchObject({
      PK: "PROFILE#p-9",
      SK: "PRACTITIONER#sub-123",
      type: "PRACTITIONER_ACCESS",
      practitionerId: "sub-123",
    });
    // Old grant pair deleted.
    expect(items[4]!.Delete!.Key).toEqual({
      PK: "PRACTITIONER#prac_1",
      SK: "PATIENT#p-9",
    });
    expect(items[5]!.Delete!.Key).toEqual({
      PK: "PROFILE#p-9",
      SK: "PRACTITIONER#prac_1",
    });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("fails closed when the target id is taken", async () => {
    const { deps } = fake((name, nth) => {
      if (name === "GetCommand") {
        return nth === 0
          ? { Item: stored }
          : { Item: { ...stored, practitionerId: "sub-123", userId: "sub-123" } };
      }
      return {};
    });
    await expect(
      new DynamoPractitionerRepository(deps).linkPractitionerLogin("prac_1", "sub-123"),
    ).rejects.toThrow(/already exists/i);
  });

  it("removePractitionerEntry deletes the roster item (no scan)", async () => {
    const { deps, sent } = fake(() => ({}));
    await new DynamoDirectoryRepository(deps).removePractitionerEntry("prac_1");
    expect(sent[0]!.name).toBe("DeleteCommand");
    expect(sent[0]!.input.Key).toEqual({
      PK: "DIRECTORY",
      SK: "PRACTITIONER#prac_1",
    });
  });
});

describe("producer — re-key cleanup (recompute-from-truth includes absence)", () => {
  it("REMOVE of a practitioner item deletes its stale directory entry", async () => {
    const d = deps();
    const removed: string[] = [];
    d.directoryRepo.removePractitionerEntry = async (id: string) => {
      removed.push(id);
    };
    const removeRecord = {
      eventName: "REMOVE",
      dynamodb: {
        Keys: { PK: { S: "PRACTITIONER#prac_old" }, SK: { S: "PRACTITIONER" } },
        OldImage: {
          practitionerId: { S: "prac_old" },
          userId: { S: "prac_old" },
          practiceId: { S: "prc-1" },
          fullName: { S: "Dr. Michael Edwards" },
          email: { S: "dr@edwardsfp.co.za" },
          status: { S: "APPROVED" },
          createdAt: { S: NOW },
          updatedAt: { S: NOW },
        },
      },
    };
    await produceFromStreamRecords(d, [removeRecord], NOW);
    expect(removed).toEqual(["prac_old"]);

    // Replay is harmless (delete of a missing entry is a no-op by contract).
    await produceFromStreamRecords(d, [removeRecord], NOW);
    expect(removed).toEqual(["prac_old", "prac_old"]);
  });
});
