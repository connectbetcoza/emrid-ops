import { beforeEach, describe, it, expect } from "vitest";
import {
  buildProducedWorkItem,
  producedWorkItemId,
  workIntentForChange,
  type StreamChange,
} from "@/lib/work/producer-core";
import { parseStreamRecord, unmarshallImage } from "@/lib/work/stream";
import { produceFromChange, produceFromStreamRecords } from "@/lib/work/producer";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockDirectoryRepository } from "@/lib/data/mock/directory-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { getCustomerState } from "@/lib/customers/state";
import { protectionStatus, readinessForCustomer } from "@/lib/customers/readiness";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { Profile } from "@/lib/data/entities";

const NOW = "2026-06-30T10:00:00.000Z";

function producerDeps() {
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

beforeEach(() => resetStore());

// ── Pure intent mapping ───────────────────────────────────────────────────────

function profileChange(
  over: Partial<StreamChange> & { status?: string; was?: string },
): StreamChange {
  return {
    eventName: over.eventName ?? "INSERT",
    keys: { PK: "PROFILE#CUS-9001", SK: "PROFILE" },
    newImage: {
      profileId: "CUS-9001",
      firstName: "New",
      lastName: "Customer",
      identityVerificationStatus: over.status ?? "PENDING",
    },
    oldImage:
      over.was !== undefined
        ? { identityVerificationStatus: over.was }
        : null,
  };
}

describe("workIntentForChange", () => {
  it("maps an identity submission (PROFILE → PENDING) to VERIFY_IDENTITY", () => {
    expect(workIntentForChange(profileChange({}))).toEqual({
      workType: "VERIFY_IDENTITY",
      customerId: "CUS-9001",
    });
  });

  it("maps a device reaching PENDING to ISSUE_CARD", () => {
    const change: StreamChange = {
      eventName: "INSERT",
      keys: { PK: "DEVICE#dev-1", SK: "DEVICE" },
      newImage: { profileId: "CUS-9001", status: "PENDING" },
      oldImage: null,
    };
    expect(workIntentForChange(change)).toEqual({
      workType: "ISSUE_CARD",
      customerId: "CUS-9001",
    });
  });

  it("does not re-fire when identity was already PENDING", () => {
    expect(
      workIntentForChange(
        profileChange({ eventName: "MODIFY", status: "PENDING", was: "PENDING" }),
      ),
    ).toBeNull();
  });

  it("ignores irrelevant changes (other status, other item, REMOVE)", () => {
    expect(workIntentForChange(profileChange({ status: "VERIFIED" }))).toBeNull();
    expect(
      workIntentForChange({
        eventName: "MODIFY",
        keys: { PK: "PROFILE#CUS-9001", SK: "EMERGENCY" },
        newImage: { profileId: "CUS-9001" },
        oldImage: null,
      }),
    ).toBeNull();
    expect(
      workIntentForChange({
        eventName: "REMOVE",
        keys: { PK: "PROFILE#CUS-9001", SK: "PROFILE" },
        newImage: null,
        oldImage: { identityVerificationStatus: "PENDING" },
      }),
    ).toBeNull();
  });
});

describe("buildProducedWorkItem", () => {
  it("uses a deterministic id and the reused type meta + rules", () => {
    const intent = { workType: "VERIFY_IDENTITY" as const, customerId: "CUS-9001" };
    expect(producedWorkItemId(intent)).toBe("CUS-9001-identity");
    const record = buildProducedWorkItem(intent, { subjectName: "New Customer", now: NOW });
    expect(record.workItemId).toBe("CUS-9001-identity");
    expect(record.workType).toBe("VERIFY_IDENTITY");
    expect(record.workDomain).toBe("IDENTITY");
    expect(record.priority).toBe("HIGH"); // default priority from the rules
    expect(record.status).toBe("OPEN");
    expect(record.source).toBe("READINESS_GAP");
    expect(record.createdAt).toBe(NOW);
  });

  it("derives the card id with the matching factor suffix", () => {
    expect(
      producedWorkItemId({ workType: "ISSUE_CARD", customerId: "CUS-9001" }),
    ).toBe("CUS-9001-card");
  });
});

// ── Stream parsing (AttributeValue wire format) ───────────────────────────────

describe("stream parsing", () => {
  it("unmarshalls scalar AttributeValues", () => {
    expect(
      unmarshallImage({
        profileId: { S: "CUS-9001" },
        count: { N: "3" },
        flag: { BOOL: true },
      }),
    ).toEqual({ profileId: "CUS-9001", count: 3, flag: true });
  });

  it("parses a raw stream record into a normalized change", () => {
    const change = parseStreamRecord({
      eventName: "INSERT",
      dynamodb: {
        Keys: { PK: { S: "PROFILE#CUS-9001" }, SK: { S: "PROFILE" } },
        NewImage: {
          profileId: { S: "CUS-9001" },
          identityVerificationStatus: { S: "PENDING" },
        },
      },
    });
    expect(change?.keys).toEqual({ PK: "PROFILE#CUS-9001", SK: "PROFILE" });
    expect(change?.newImage?.identityVerificationStatus).toBe("PENDING");
  });

  it("returns null for a malformed record (no keys)", () => {
    expect(parseStreamRecord({ eventName: "INSERT", dynamodb: {} })).toBeNull();
    expect(parseStreamRecord(null)).toBeNull();
  });
});

// ── Handler (idempotent create over injected repos) ───────────────────────────

function seedProfile(id: string) {
  const profile: Profile = {
    profileId: id,
    emrid: `EMR-${id}`,
    firstName: "Lerato",
    lastName: "Producer",
    dateOfBirth: "1990-01-01",
    status: "ACTIVE",
    verificationLevel: "UNVERIFIED",
    identityVerificationStatus: "PENDING",
    createdAt: NOW,
    updatedAt: NOW,
  };
  mockStore.profiles.set(id, profile);
}

describe("produceFromChange (handler)", () => {
  it("creates the VERIFY_IDENTITY work item once, resolving the subject name", async () => {
    seedProfile("CUS-PROD-1");
    const deps = producerDeps();
    const change = parseStreamRecord({
      eventName: "INSERT",
      dynamodb: {
        Keys: { PK: { S: "PROFILE#CUS-PROD-1" }, SK: { S: "PROFILE" } },
        NewImage: {
          profileId: { S: "CUS-PROD-1" },
          identityVerificationStatus: { S: "PENDING" },
        },
      },
    })!;

    const first = await produceFromChange(deps, change, NOW);
    expect(first).toEqual({ created: true, workItemId: "CUS-PROD-1-identity" });

    const items = await deps.workRepo.listForCustomer("CUS-PROD-1");
    const produced = items.find((w) => w.workItemId === "CUS-PROD-1-identity")!;
    expect(produced.subjectName).toBe("Lerato Producer");
    expect(produced.workType).toBe("VERIFY_IDENTITY");
  });

  it("is idempotent: replaying the same event creates no duplicate", async () => {
    seedProfile("CUS-PROD-1");
    const deps = producerDeps();
    const change = parseStreamRecord({
      eventName: "INSERT",
      dynamodb: {
        Keys: { PK: { S: "PROFILE#CUS-PROD-1" }, SK: { S: "PROFILE" } },
        NewImage: {
          profileId: { S: "CUS-PROD-1" },
          identityVerificationStatus: { S: "PENDING" },
        },
      },
    })!;

    await produceFromChange(deps, change, NOW);
    const replay = await produceFromChange(deps, change, NOW);
    expect(replay).toEqual({
      created: false,
      workItemId: "CUS-PROD-1-identity",
      reason: "exists",
    });

    const idItems = (await deps.workRepo.listForCustomer("CUS-PROD-1")).filter(
      (w) => w.workItemId === "CUS-PROD-1-identity",
    );
    expect(idItems).toHaveLength(1); // exactly one, despite the replay
  });

  it("is a no-op for an irrelevant change", async () => {
    const deps = producerDeps();
    const result = await produceFromChange(
      deps,
      {
        eventName: "MODIFY",
        keys: { PK: "PROFILE#CUS-PROD-1", SK: "EMERGENCY" },
        newImage: { profileId: "CUS-PROD-1" },
        oldImage: null,
      },
      NOW,
    );
    expect(result).toEqual({ created: false, reason: "no-op" });
  });
});

describe("produceFromStreamRecords (batch)", () => {
  it("processes a batch and skips malformed records", async () => {
    seedProfile("CUS-PROD-2");
    const deps = producerDeps();
    const results = await produceFromStreamRecords(
      deps,
      [
        { junk: true },
        {
          eventName: "INSERT",
          dynamodb: {
            Keys: { PK: { S: "PROFILE#CUS-PROD-2" }, SK: { S: "PROFILE" } },
            NewImage: {
              profileId: { S: "CUS-PROD-2" },
              identityVerificationStatus: { S: "PENDING" },
            },
          },
        },
      ],
      NOW,
    );
    expect(results).toEqual([{ created: true, workItemId: "CUS-PROD-2-identity" }]);
  });
});

// ── State-sync: real activation completes card work + crosses the boundary ────

/** The Patient Platform's activation write, as seen on the stream. */
function activationRecord(customerId: string) {
  const deviceId = `dev-${customerId}`;
  return {
    eventName: "MODIFY",
    dynamodb: {
      Keys: { PK: { S: `DEVICE#${deviceId}` }, SK: { S: "DEVICE" } },
      OldImage: {
        deviceId: { S: deviceId },
        profileId: { S: customerId },
        status: { S: "PENDING" },
      },
      NewImage: {
        deviceId: { S: deviceId },
        profileId: { S: customerId },
        status: { S: "ACTIVE" },
      },
    },
  };
}

/** Simulate the Patient Platform's committed write the stream reflects. */
function activateStoreDevice(customerId: string) {
  const deviceId = `dev-${customerId}`;
  const device = mockStore.devices.get(deviceId)!;
  mockStore.devices.set(deviceId, {
    ...device,
    status: "ACTIVE",
    activationCode: undefined,
    activatedAt: NOW,
    updatedAt: NOW,
  });
}

describe("device PENDING→ACTIVE completes the ISSUE_CARD work (state sync)", () => {
  // Sipho (CUS-2042): identity VERIFIED, emergency + 1 contact, profile
  // complete, device PENDING, ISSUE_CARD work active — one activation from 100%.
  const id = "CUS-2042";

  it("completes the work item, leaves no active card work, and the customer is consistent", async () => {
    const deps = producerDeps();
    activateStoreDevice(id);

    const results = await produceFromStreamRecords(deps, [activationRecord(id)], NOW);
    expect(results).toEqual([
      { created: false, completed: true, workItemId: `${id}-card` },
    ]);

    // Work item DONE in both projections → no active card work remains.
    const items = await deps.workRepo.listForCustomer(id);
    expect(items.find((w) => w.workItemId === `${id}-card`)?.status).toBe("DONE");
    const activeCardWork = items.filter(
      (w) => w.workType === "ISSUE_CARD" && w.status !== "DONE" && w.status !== "CANCELLED",
    );
    expect(activeCardWork).toHaveLength(0);

    // Customer state is consistent: Protected, card active, readiness 100.
    const customer = (await getCustomerState(id))!;
    expect(customer.cardStatus).toBe("ACTIVE");
    expect(protectionStatus(customer)).toBe("PROTECTED");
    expect(readinessForCustomer(customer).score).toBe(100);

    // The system completion is audited (ids only).
    const events = await deps.auditRepo.listForProfile(id);
    const completion = events.find((e) => e.eventType === "OPS_WORK_TRANSITION")!;
    expect(completion.actorType).toBe("SYSTEM");
    expect(completion.metadata).toMatchObject({ trigger: "CARD_ACTIVATED" });
  });

  it("increments Protected Lives exactly once, and a replay does not re-increment", async () => {
    const deps = producerDeps();
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;
    activateStoreDevice(id);

    await produceFromStreamRecords(deps, [activationRecord(id)], NOW);
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before + 1);

    // Replay the identical stream event (redelivery): terminal work status is
    // the dedupe marker — no duplicate work, no re-increment.
    const replay = await produceFromStreamRecords(deps, [activationRecord(id)], NOW);
    expect(replay).toEqual([
      {
        created: false,
        completed: false,
        workItemId: `${id}-card`,
        reason: "already-done",
      },
    ]);
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before + 1);
  });

  it("completes the work but does NOT cross the boundary when protection facets are incomplete", async () => {
    // Kabelo (CUS-2048): identity VERIFIED but NO emergency info — activation
    // completes the card work, yet the customer is honestly not Protected.
    const other = "CUS-2048";
    const deps = producerDeps();
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;
    activateStoreDevice(other);

    const results = await produceFromStreamRecords(deps, [activationRecord(other)], NOW);
    expect(results[0]).toMatchObject({ completed: true });
    expect(
      (await deps.workRepo.listForCustomer(other)).find(
        (w) => w.workItemId === `${other}-card`,
      )?.status,
    ).toBe("DONE");

    const customer = (await getCustomerState(other))!;
    expect(protectionStatus(customer)).not.toBe("PROTECTED");
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before);
  });

  it("is a clean no-op when no card work item exists for the customer", async () => {
    const deps = producerDeps();
    // A customer unknown to the work index (no seeded work of any kind).
    const results = await produceFromStreamRecords(
      deps,
      [activationRecord("CUS-UNKNOWN")],
      NOW,
    );
    expect(results[0]).toMatchObject({ completed: false, reason: "missing" });
  });
});
