import { beforeEach, describe, it, expect } from "vitest";
import {
  DEVICE_ACTION_PERMISSION,
  executeDeviceAssist,
  validateDeviceAssist,
} from "@/lib/customers/device-assist";
import { PERMISSION_DENIED_MESSAGE } from "@/lib/auth/permissions";
import {
  generateActivationCode,
  generateDeviceToken,
} from "@/lib/devices/token";
import { applyDeviceCrossing, produceFromChange } from "@/lib/work/producer";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { DynamoDeviceRepository } from "@/lib/data/aws/device-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockNoteRepository } from "@/lib/data/mock/note-repository";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { MockDirectoryRepository } from "@/lib/data/mock/directory-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { Device, DirectoryEntry } from "@/lib/data/entities";
import type { DirectoryRepository } from "@/lib/data/types";
import type { DynamoDeps } from "@/lib/data/aws/client";

const NOW = "2026-08-15T12:00:00.000Z";
const CS = { userId: "cs-1", fullName: "Support", roles: ["CUSTOMER_SUPPORT"] as const };
const OA = { userId: "oa-1", fullName: "Admin", roles: ["OPERATIONS_ADMIN"] as const };

beforeEach(() => resetStore());

function seedDevice(id: string, profileId: string, status: Device["status"]): Device {
  const device: Device = {
    deviceId: id,
    profileId,
    status,
    token: generateDeviceToken(),
    issuedAt: NOW,
    updatedAt: NOW,
  };
  mockStore.devices.set(id, device);
  return device;
}

function assistDeps() {
  return {
    deviceRepo: new MockDeviceRepository(),
    auditRepo: new MockAuditRepository(),
    noteRepo: new MockNoteRepository(),
  };
}

const input = (over: Partial<Parameters<typeof validateDeviceAssist>[0]> = {}) => ({
  action: "SUSPEND" as const,
  deviceId: "dev-1",
  verifiedVia: "PHONE_CALLBACK",
  reason: "Customer reports the card lost at the gym.",
  ...over,
});

// ── Token contract ────────────────────────────────────────────────────────────

describe("canonical token generation (shared-format contract)", () => {
  it("pins the dvtk_ + 28-char Crockford format and code shape", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateDeviceToken()).toMatch(/^dvtk_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{28}$/);
      expect(generateActivationCode()).toMatch(
        /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/,
      );
    }
  });
});

// ── Validation + RBAC split ───────────────────────────────────────────────────

describe("device assist authorization + validation", () => {
  it("permission tiers: assistive vs destructive", () => {
    expect(DEVICE_ACTION_PERMISSION).toEqual({
      SUSPEND: "ASSIST_DEVICES",
      REACTIVATE: "ASSIST_DEVICES",
      REVOKE: "REVOKE_DEVICES",
      REPLACE: "REVOKE_DEVICES",
    });
  });

  it("CUSTOMER_SUPPORT can suspend/reactivate but NOT revoke/replace — zero writes on denial", async () => {
    const deps = assistDeps();
    seedDevice("dev-1", "CUS-1", "ACTIVE");
    const ok = await executeDeviceAssist(deps, {
      customerId: "CUS-1", input: input(), actor: CS, noteId: "n1", now: NOW,
    });
    expect(ok.ok).toBe(true);

    seedDevice("dev-2", "CUS-1", "ACTIVE");
    const denied = await executeDeviceAssist(deps, {
      customerId: "CUS-1",
      input: input({ action: "REVOKE", deviceId: "dev-2" }),
      actor: CS,
      noteId: "n2",
      now: NOW,
    });
    expect(denied).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect(mockStore.devices.get("dev-2")?.status).toBe("ACTIVE"); // untouched
  });

  it("requires verification method and reason", () => {
    expect(validateDeviceAssist(input({ verifiedVia: "" }))).toMatch(/verified/i);
    expect(validateDeviceAssist(input({ reason: " " }))).toMatch(/reason/i);
    expect(validateDeviceAssist(input())).toBeNull();
  });
});

// ── Legal transitions + hygiene ───────────────────────────────────────────────

describe("legal transitions and audit/note hygiene", () => {
  it("illegal transitions fail closed (mock parity with conditional writes)", async () => {
    const deps = assistDeps();
    seedDevice("dev-p", "CUS-1", "PENDING");
    const suspendPending = await executeDeviceAssist(deps, {
      customerId: "CUS-1",
      input: input({ deviceId: "dev-p" }),
      actor: CS, noteId: "n1", now: NOW,
    });
    expect(suspendPending.ok).toBe(false);
    expect(mockStore.devices.get("dev-p")?.status).toBe("PENDING");

    seedDevice("dev-a", "CUS-1", "ACTIVE");
    const reactivateActive = await executeDeviceAssist(deps, {
      customerId: "CUS-1",
      input: input({ action: "REACTIVATE", deviceId: "dev-a" }),
      actor: CS, noteId: "n2", now: NOW,
    });
    expect(reactivateActive.ok).toBe(false);

    seedDevice("dev-r", "CUS-1", "REVOKED");
    const revokeRevoked = await executeDeviceAssist(deps, {
      customerId: "CUS-1",
      input: input({ action: "REVOKE", deviceId: "dev-r" }),
      actor: OA, noteId: "n3", now: NOW,
    });
    expect(revokeRevoked.ok).toBe(false);
  });

  it("REPLACE revokes, issues canonical PENDING device, audits with ids only, notes without credentials", async () => {
    const deps = assistDeps();
    seedDevice("dev-old", "CUS-1", "ACTIVE");
    const result = await executeDeviceAssist(deps, {
      customerId: "CUS-1",
      input: input({ action: "REPLACE", deviceId: "dev-old" }),
      actor: OA, noteId: "n1", now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockStore.devices.get("dev-old")?.status).toBe("REVOKED");
    const replacement = mockStore.devices.get(result.replacementDeviceId!)!;
    expect(replacement.status).toBe("PENDING");
    expect(replacement.token).toMatch(/^dvtk_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{28}$/);
    expect(replacement.activationCode).toBeTruthy();

    // Audit: DEVICE_REVOKED + CARD_REQUESTED with linkage — never token/code.
    const events = await deps.auditRepo.listForProfile("CUS-1");
    const types = events.map((e) => e.eventType);
    expect(types).toContain("DEVICE_REVOKED");
    expect(types).toContain("CARD_REQUESTED");
    const requested = events.find((e) => e.eventType === "CARD_REQUESTED")!;
    expect(requested.metadata).toMatchObject({ replacesDeviceId: "dev-old" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(replacement.token);
    expect(serialized).not.toContain(replacement.activationCode!);

    // Note: action + method + reason, no credentials.
    const notes = await deps.noteRepo.listForSubject("CUS-1");
    expect(notes[0]!.body).toContain("replacement issued");
    expect(notes[0]!.body).not.toContain(replacement.token);
    expect(notes[0]!.body).not.toContain(replacement.activationCode!);
  });

  it("REPLACE streams into the existing ISSUE_CARD workflow (producer intent)", async () => {
    const deps = assistDeps();
    seedDevice("dev-old", "CUS-2042", "ACTIVE");
    const result = await executeDeviceAssist(deps, {
      customerId: "CUS-2042",
      input: input({ action: "REPLACE", deviceId: "dev-old" }),
      actor: OA, noteId: "n1", now: NOW,
    });
    if (!result.ok) throw new Error("expected ok");
    const replacement = mockStore.devices.get(result.replacementDeviceId!)!;

    // Simulate the stream event the PENDING put emits.
    const producerDeps = {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
      deviceRepo: new MockDeviceRepository(),
      emergencyRepo: new MockEmergencyProfileRepository(),
      aggregateRepo: new MockAggregateRepository(),
      auditRepo: new MockAuditRepository(),
      directoryRepo: new MockDirectoryRepository(),
      practitionerRepo: new MockPractitionerRepository(),
    };
    const produced = await produceFromChange(producerDeps, {
      eventName: "INSERT",
      keys: { PK: `DEVICE#${replacement.deviceId}`, SK: "DEVICE" },
      newImage: {
        deviceId: replacement.deviceId,
        profileId: "CUS-2042",
        status: "PENDING",
      },
      oldImage: null,
    });
    expect(produced.created).toBe(true);
    const work = await producerDeps.workRepo.listForCustomer("CUS-2042");
    expect(work.some((w) => w.workType === "ISSUE_CARD" && w.status === "OPEN")).toBe(true);
  });
});

// ── 2b: producer crossing ownership — multi-device + replay matrix ────────────

function statefulDirectory(seed: DirectoryEntry): {
  repo: DirectoryRepository;
  stored: Map<string, DirectoryEntry>;
} {
  const stored = new Map<string, DirectoryEntry>([[seed.profileId, seed]]);
  const base = new MockDirectoryRepository();
  return {
    stored,
    repo: {
      getEntry: async (id) => stored.get(id) ?? null,
      upsertEntry: async (e) => {
        stored.set(e.profileId, e);
        return e;
      },
      listCustomers: async () => [...stored.values()],
      listPractitioners: base.listPractitioners.bind(base),
      upsertPractitionerEntry: base.upsertPractitionerEntry.bind(base),
      removePractitionerEntry: base.removePractitionerEntry.bind(base),
    },
  };
}

describe("producer-owned device crossings (2b): multi-device safety + replay", () => {
  const id = "CUS-2042"; // seeded: identity VERIFIED? — force facets below
  function crossingDeps(entry: DirectoryEntry) {
    const { repo } = statefulDirectory(entry);
    return {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
      deviceRepo: new MockDeviceRepository(),
      emergencyRepo: new MockEmergencyProfileRepository(),
      aggregateRepo: new MockAggregateRepository(),
      auditRepo: new MockAuditRepository(),
      directoryRepo: repo,
      practitionerRepo: new MockPractitionerRepository(),
    };
  }
  function entryWith(status: DirectoryEntry["protectionStatus"]): DirectoryEntry {
    return {
      profileId: id,
      emrid: "EMR-1",
      firstName: "Test",
      lastName: "Person",
      displayName: "Test Person",
      identityStatus: "VERIFIED",
      verificationLevel: "IDENTITY_VERIFIED",
      protectionStatus: status,
      readinessScore: 85,
      activeWorkCount: 0,
      lastActivityAt: NOW,
      profileComplete: true,
      emergencyInfoComplete: true,
      emergencyContactsCount: 1,
      cardStatus: "ACTIVE",
      joinedAt: NOW,
      updatedAt: NOW,
    };
  }
  /** Make the customer's TRUTH facets: identity VERIFIED + emergency present. */
  function makeProtectedFacets() {
    const profile = mockStore.profiles.get(id)!;
    mockStore.profiles.set(id, {
      ...profile,
      identityVerificationStatus: "VERIFIED",
    });
    // seed emergency presence via store if absent
    if (!mockStore.emergencyProfiles.get(id)) {
      mockStore.emergencyProfiles.set(id, {
        profileId: id,
        bloodType: { value: "O+", visibility: "PUBLIC_EMERGENCY" },
        emergencyContacts: [],
        updatedAt: NOW,
      } as never);
    }
  }

  it("removing ONE of several ACTIVE devices does not decrement", async () => {
    makeProtectedFacets();
    seedDevice("dev-1", id, "ACTIVE");
    seedDevice("dev-2", id, "SUSPENDED");
    mockStore.devices.set("dev-2", { ...mockStore.devices.get("dev-2")!, status: "ACTIVE" });
    const deps = crossingDeps(entryWith("PROTECTED"));
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;

    mockStore.devices.set("dev-1", { ...mockStore.devices.get("dev-1")!, status: "SUSPENDED" });
    await applyDeviceCrossing(deps, id);
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before);
  });

  it("removing the LAST ACTIVE device decrements exactly once; replay does not move it twice", async () => {
    makeProtectedFacets();
    seedDevice("dev-only", id, "ACTIVE");
    const deps = crossingDeps(entryWith("PROTECTED"));
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;

    // The Ops assisted suspend (device write only) …
    mockStore.devices.set("dev-only", {
      ...mockStore.devices.get("dev-only")!,
      status: "SUSPENDED",
    });
    // … then the stream event drives the crossing + directory refresh.
    await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "DEVICE#dev-only", SK: "DEVICE" },
      newImage: { deviceId: "dev-only", profileId: id, status: "SUSPENDED" },
      oldImage: { deviceId: "dev-only", profileId: id, status: "ACTIVE" },
    });
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before - 1);

    // Duplicate stream delivery: directory now records the lower state.
    await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "DEVICE#dev-only", SK: "DEVICE" },
      newImage: { deviceId: "dev-only", profileId: id, status: "SUSPENDED" },
      oldImage: { deviceId: "dev-only", profileId: id, status: "ACTIVE" },
    });
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before - 1);
  });

  it("reactivating while ANOTHER ACTIVE device exists does not increment", async () => {
    makeProtectedFacets();
    seedDevice("dev-1", id, "ACTIVE");
    seedDevice("dev-2", id, "SUSPENDED");
    const deps = crossingDeps(entryWith("PROTECTED"));
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;

    mockStore.devices.set("dev-2", { ...mockStore.devices.get("dev-2")!, status: "ACTIVE" });
    await applyDeviceCrossing(deps, id);
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before);
  });

  it("reactivating when NO ACTIVE device exists increments exactly once (with replay)", async () => {
    makeProtectedFacets();
    seedDevice("dev-1", id, "SUSPENDED");
    const deps = crossingDeps(entryWith("IN_PROGRESS"));
    const before = (await deps.aggregateRepo.getProtectedLives()).protectedCount;

    mockStore.devices.set("dev-1", { ...mockStore.devices.get("dev-1")!, status: "ACTIVE" });
    await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "DEVICE#dev-1", SK: "DEVICE" },
      newImage: { deviceId: "dev-1", profileId: id, status: "ACTIVE" },
      oldImage: { deviceId: "dev-1", profileId: id, status: "SUSPENDED" },
    });
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before + 1);

    await produceFromChange(deps, {
      eventName: "MODIFY",
      keys: { PK: "DEVICE#dev-1", SK: "DEVICE" },
      newImage: { deviceId: "dev-1", profileId: id, status: "ACTIVE" },
      oldImage: { deviceId: "dev-1", profileId: id, status: "SUSPENDED" },
    });
    expect((await deps.aggregateRepo.getProtectedLives()).protectedCount).toBe(before + 1);
  });
});

// ── Dynamo command shapes ─────────────────────────────────────────────────────

describe("Dynamo device-assist command shapes", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fake(respond: (name: string) => unknown): { deps: DynamoDeps; sent: Captured[] } {
    const sent: Captured[] = [];
    return {
      sent,
      deps: {
        table: "emrid-test",
        doc: {
          send: (async (c: { constructor: { name: string }; input: Record<string, unknown> }) => {
            sent.push({ name: c.constructor.name, input: c.input });
            return respond(c.constructor.name);
          }) as DynamoDeps["doc"]["send"],
        },
      },
    };
  }
  const activeDevice = {
    deviceId: "dev-1", profileId: "CUS-1", status: "ACTIVE",
    token: "dvtk_X", issuedAt: NOW, updatedAt: NOW,
  };

  it("suspend = conditional dual-item TransactWrite (status IN allowed set), no scan", async () => {
    const { deps, sent } = fake((name) =>
      name === "QueryCommand" ? { Items: [{ ...activeDevice, PK: "x", SK: "y" }] } : {},
    );
    await new DynamoDeviceRepository(deps).suspendDevice("CUS-1", "dev-1");
    const tx = sent.find((c) => c.name === "TransactWriteCommand")!;
    const items = tx.input.TransactItems as Array<{ Update: Record<string, unknown> }>;
    expect(items).toHaveLength(2);
    expect(items[0]!.Update.ConditionExpression).toContain("#s IN");
    expect(items[0]!.Update.Key).toEqual({ PK: "DEVICE#dev-1", SK: "DEVICE" });
    expect(items[1]!.Update.Key).toEqual({ PK: "PROFILE#CUS-1", SK: "DEVICE#dev-1" });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("replacement = dual Put, canonical token on the GSI1 key, conditional create", async () => {
    const { deps, sent } = fake(() => ({}));
    const device = await new DynamoDeviceRepository(deps).issueReplacementDevice("CUS-1");
    expect(device.token).toMatch(/^dvtk_/);
    const tx = sent.find((c) => c.name === "TransactWriteCommand")!;
    const items = tx.input.TransactItems as Array<{ Put: { Item: Record<string, unknown>; ConditionExpression?: string } }>;
    expect(items).toHaveLength(2);
    expect(items[0]!.Put.ConditionExpression).toBe("attribute_not_exists(PK)");
    expect(String(items[0]!.Put.Item.GSI1PK)).toMatch(/^TOKEN#dvtk_/);
    expect(items[0]!.Put.Item.status).toBe("PENDING");
  });
});
