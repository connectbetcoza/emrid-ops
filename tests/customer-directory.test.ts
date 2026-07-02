import { beforeEach, describe, it, expect } from "vitest";
import {
  buildDirectoryEntry,
  customerFromState,
  entryToCustomer,
} from "@/lib/customers/directory-core";
import { DynamoDirectoryRepository } from "@/lib/data/aws/directory-repository";
import { MockDirectoryRepository } from "@/lib/data/mock/directory-repository";
import {
  DIRECTORY_PK,
  directoryItem,
  directorySk,
  itemToDirectoryEntry,
} from "@/lib/data/aws/keys";
import { produceFromChange } from "@/lib/work/producer";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { resetStore } from "@/lib/data/mock/store";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type {
  AuditEvent,
  Device,
  DirectoryEntry,
  EmergencyProfile,
  Profile,
} from "@/lib/data/entities";
import type { WorkItemRecord } from "@/lib/data/work-record";

const NOW = "2026-07-02T18:00:00.000Z";

beforeEach(() => resetStore());

const profile: Profile = {
  profileId: "p1",
  emrid: "EMR-DIR1",
  firstName: "Robyn",
  lastName: "Holmes",
  dateOfBirth: "1992-03-04",
  status: "ACTIVE",
  verificationLevel: "UNVERIFIED",
  identityVerificationStatus: "PENDING",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

const emergency: EmergencyProfile = {
  profileId: "p1",
  bloodType: { value: "A+", visibility: "PUBLIC_EMERGENCY" },
  emergencyContacts: {
    value: [{ name: "Kin", phone: "+27800000001" }],
    visibility: "PUBLIC_EMERGENCY",
  },
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const pendingDevice: Device = {
  deviceId: "d1",
  profileId: "p1",
  status: "PENDING",
  token: "tok-1",
  issuedAt: "2026-06-03T00:00:00.000Z",
  updatedAt: "2026-06-03T00:00:00.000Z",
};

const openWork: WorkItemRecord = {
  workItemId: "p1-identity",
  customerId: "p1",
  workType: "VERIFY_IDENTITY",
  workDomain: "IDENTITY",
  status: "OPEN",
  priority: "HIGH",
  step: 0,
  assignment: { assigneeName: null },
  source: "READINESS_GAP",
  title: "Verify identity",
  subjectName: "Robyn Holmes",
  nextAction: "Review submitted ID document",
  dueAt: "2026-07-03T00:00:00.000Z",
  createdAt: NOW,
  updatedAt: NOW,
};

const audit: AuditEvent = {
  eventId: "e1",
  eventType: "IDENTITY_VERIFICATION_SUBMITTED",
  actorType: "USER",
  targetType: "PROFILE",
  targetId: "p1",
  timestamp: "2026-06-30T09:00:00.000Z",
};

describe("buildDirectoryEntry (pure, same cores as every surface)", () => {
  it("derives the full operational picture", () => {
    const entry = buildDirectoryEntry({
      profile,
      emergency,
      devices: [pendingDevice],
      workRecords: [openWork, { ...openWork, workItemId: "p1-x", status: "DONE" }],
      auditEvents: [audit],
      now: NOW,
    });
    expect(entry).toMatchObject({
      profileId: "p1",
      emrid: "EMR-DIR1",
      displayName: "Robyn Holmes",
      identityStatus: "PENDING",
      protectionStatus: "IN_PROGRESS",
      readinessScore: 55, // profile 15 + emergency 25 + contact 15
      activeWorkCount: 1, // DONE item excluded
      lastActivityAt: "2026-06-30T09:00:00.000Z",
      emergencyContactsCount: 1,
      cardStatus: "PENDING",
      joinedAt: "2026-06-01T00:00:00.000Z",
    });
  });

  it("round-trips through the item mappers and back to a Customer", () => {
    const entry = buildDirectoryEntry({
      profile, emergency, devices: [], workRecords: [], auditEvents: [], now: NOW,
    });
    const item = directoryItem(entry);
    expect(item.PK).toBe("DIRECTORY");
    expect(item.SK).toBe("CUSTOMER#p1");
    expect(item.type).toBe("CUSTOMER_DIRECTORY");
    expect(itemToDirectoryEntry(item)).toEqual(entry);

    const customer = entryToCustomer(entry);
    expect(customer.id).toBe("p1");
    expect(customer.fullName).toBe("Robyn Holmes");
    expect(customerFromState({ profile, emergency, devices: [] })).toMatchObject({
      id: "p1",
      identityStatus: "PENDING",
    });
  });
});

describe("directory key contract (Ops-owned)", () => {
  it("pins the key strings", () => {
    expect(DIRECTORY_PK).toBe("DIRECTORY");
    expect(directorySk("p1")).toBe("CUSTOMER#p1");
  });
});

describe("DynamoDirectoryRepository", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fakeDeps(
    respond: (name: string, input: Record<string, unknown>) => unknown,
  ): { deps: DynamoDeps; sent: Captured[] } {
    const sent: Captured[] = [];
    const deps: DynamoDeps = {
      table: "emrid-test",
      doc: {
        send: (async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
          sent.push({ name: command.constructor.name, input: command.input });
          return respond(command.constructor.name, command.input);
        }) as DynamoDeps["doc"]["send"],
      },
    };
    return { deps, sent };
  }

  it("listCustomers queries the DIRECTORY partition with pagination — never a scan", async () => {
    const entry = buildDirectoryEntry({
      profile, emergency, devices: [], workRecords: [], auditEvents: [], now: NOW,
    });
    let page = 0;
    const { deps, sent } = fakeDeps(() => {
      page += 1;
      return page === 1
        ? { Items: [directoryItem(entry)], LastEvaluatedKey: { PK: "DIRECTORY", SK: "CUSTOMER#p1" } }
        : { Items: [directoryItem({ ...entry, profileId: "p2" })] };
    });
    const list = await new DynamoDirectoryRepository(deps).listCustomers();
    expect(list).toHaveLength(2);
    const queries = sent.filter((c) => c.name === "QueryCommand");
    expect(queries).toHaveLength(2);
    expect(queries[0]!.input.ExpressionAttributeValues).toMatchObject({ ":pk": "DIRECTORY" });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("upsertEntry puts the full item at the directory key", async () => {
    const entry = buildDirectoryEntry({
      profile, emergency, devices: [], workRecords: [], auditEvents: [], now: NOW,
    });
    const { deps, sent } = fakeDeps(() => ({}));
    await new DynamoDirectoryRepository(deps).upsertEntry(entry);
    const put = sent.find((c) => c.name === "PutCommand")!;
    const item = put.input.Item as Record<string, unknown>;
    expect(item.PK).toBe("DIRECTORY");
    expect(item.SK).toBe("CUSTOMER#p1");
    expect(item.readinessScore).toBe(entry.readinessScore);
  });
});

describe("producer keeps the directory fresh", () => {
  function depsWithCapture() {
    const upserts: DirectoryEntry[] = [];
    return {
      deps: {
        workRepo: new MockWorkItemRepository(),
        profileRepo: new MockProfileRepository(),
        deviceRepo: new MockDeviceRepository(),
        emergencyRepo: new MockEmergencyProfileRepository(),
        aggregateRepo: new MockAggregateRepository(),
        auditRepo: new MockAuditRepository(),
        practitionerRepo: new MockPractitionerRepository(),
        directoryRepo: {
          listCustomers: async () => [],
          getEntry: async () => null,
          upsertEntry: async (e: DirectoryEntry) => { upserts.push(e); return e; },
          listPractitioners: async () => [],
          upsertPractitionerEntry: async (e: never) => e,
        },
      },
      upserts,
    };
  }

  it("an emergency update (no work implied) refreshes the customer's entry", async () => {
    const { deps, upserts } = depsWithCapture();
    const result = await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "PROFILE#CUS-2042", SK: "EMERGENCY" },
      newImage: { profileId: "CUS-2042" },
      oldImage: { profileId: "CUS-2042" },
    }, NOW);
    expect(result.reason).toBe("no-op"); // no work action
    expect(upserts).toHaveLength(1); // but the directory was refreshed
    expect(upserts[0]!.profileId).toBe("CUS-2042");
    expect(upserts[0]!.displayName).toBe("Sipho Dlamini");
  });

  it("a work-creating change refreshes AFTER the creation (count includes it)", async () => {
    const { deps, upserts } = depsWithCapture();
    const before = (await deps.workRepo.listForCustomer("CUS-2042")).filter(
      (w) => !["DONE", "CANCELLED"].includes(w.status),
    ).length;
    // Note: CUS-2042's card work already exists, so use an identity re-submission
    // shape for a customer whose identity work doesn't exist: CUS-2044 (Grace).
    await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "PROFILE#CUS-2044", SK: "PROFILE" },
      newImage: { profileId: "CUS-2044", identityVerificationStatus: "PENDING" },
      oldImage: { profileId: "CUS-2044", identityVerificationStatus: "UNVERIFIED" },
    }, NOW);
    expect(before).toBeGreaterThanOrEqual(0);
    const entry = upserts.at(-1)!;
    expect(entry.profileId).toBe("CUS-2044");
    // The refresh ran after the creation, so the new identity work is counted.
    const active = (await deps.workRepo.listForCustomer("CUS-2044")).filter(
      (w) => !["DONE", "CANCELLED"].includes(w.status),
    ).length;
    expect(entry.activeWorkCount).toBe(active);
  });

  it("DIRECTORY items never re-trigger a refresh (self-loop guard)", async () => {
    const { deps, upserts } = depsWithCapture();
    const result = await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "DIRECTORY", SK: "CUSTOMER#CUS-2042" },
      newImage: { profileId: "CUS-2042" },
      oldImage: null,
    }, NOW);
    expect(result.reason).toBe("no-op");
    expect(upserts).toHaveLength(0);
  });
});

describe("MockDirectoryRepository (compute-on-read, always consistent)", () => {
  it("lists every seeded customer with live-derived state", async () => {
    const list = await new MockDirectoryRepository().listCustomers();
    expect(list.length).toBeGreaterThan(0);
    const sipho = list.find((e) => e.profileId === "CUS-2042")!;
    expect(sipho.displayName).toBe("Sipho Dlamini");
    expect(sipho.identityStatus).toBe("VERIFIED");
  });
});
