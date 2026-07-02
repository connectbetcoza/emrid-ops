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
