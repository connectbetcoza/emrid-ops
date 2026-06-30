import { beforeEach, describe, it, expect } from "vitest";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDocumentRepository } from "@/lib/data/mock/document-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { resetStore } from "@/lib/data/mock/store";
import { DynamoProfileRepository } from "@/lib/data/aws/profile-repository";
import { DynamoAuditRepository } from "@/lib/data/aws/audit-repository";
import { DynamoDocumentRepository } from "@/lib/data/aws/document-repository";
import { DynamoEmergencyProfileRepository } from "@/lib/data/aws/emergency-profile-repository";
import { emergencyItem, profileItem } from "@/lib/data/aws/keys";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type { Profile } from "@/lib/data/entities";

// ── Mock repositories ─────────────────────────────────────────────────────────

beforeEach(() => resetStore());

describe("MockProfileRepository", () => {
  const repo = new MockProfileRepository();

  it("reads a seeded profile and the isolated identity record", async () => {
    expect((await repo.getProfile("CUS-2041"))?.firstName).toBe("Thandi");
    expect((await repo.getIdentity("CUS-2041"))?.idNumber).toBeTruthy();
    expect(await repo.getProfile("nope")).toBeNull();
  });

  it("lists profiles by identity status (the PENDING set)", async () => {
    const pending = (await repo.listByIdentityStatus("PENDING")).map((p) => p.profileId);
    expect(pending).toContain("CUS-2041"); // Thandi
    expect(pending).toContain("CUS-2045"); // Bongani
    const verified = await repo.listByIdentityStatus("VERIFIED");
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((p) => p.identityVerificationStatus === "VERIFIED")).toBe(true);
  });

  it("setIdentityDecision VERIFIED updates status, level and verifiedAt", async () => {
    const updated = await repo.setIdentityDecision("CUS-2041", {
      decision: "VERIFIED",
      decidedByOpsUserId: "ops-1",
    });
    expect(updated.identityVerificationStatus).toBe("VERIFIED");
    expect(updated.verificationLevel).toBe("IDENTITY_VERIFIED");
    expect(updated.identityVerifiedAt).toBeTruthy();
    // persisted
    expect((await repo.getProfile("CUS-2041"))?.identityVerificationStatus).toBe("VERIFIED");
  });
});

describe("MockAuditRepository", () => {
  it("appends and lists by profile (newest first)", async () => {
    const audit = new MockAuditRepository();
    await audit.record({
      eventType: "IDENTITY_VERIFIED",
      actorType: "OPS",
      actorId: "ops-1",
      targetType: "PROFILE",
      targetId: "CUS-2041",
    });
    const events = await audit.listForProfile("CUS-2041");
    expect(events).toHaveLength(1);
    expect(events[0]!.eventId).toBeTruthy();
    expect(events[0]!.timestamp).toBeTruthy();
  });
});

describe("MockDocumentRepository", () => {
  it("lists the seeded ID document", async () => {
    const docs = await new MockDocumentRepository().listForProfile("CUS-2041");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.category).toBe("ID_DOCUMENT");
  });
});

describe("MockEmergencyProfileRepository", () => {
  const repo = new MockEmergencyProfileRepository();

  it("reads a seeded emergency profile (info + contacts)", async () => {
    const e = await repo.getEmergencyProfile("CUS-2041"); // info + 2 contacts
    expect(e?.bloodType?.value).toBe("O+");
    expect(e?.emergencyContacts?.value).toHaveLength(2);
  });

  it("returns null for a customer with no emergency data", async () => {
    // CUS-2044 (Grace): no emergency info and zero contacts → no item seeded.
    expect(await repo.getEmergencyProfile("CUS-2044")).toBeNull();
  });
});

// ── DynamoDB repositories (fake doc.send capturing commands; no AWS) ──────────

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

const seedProfile: Profile = {
  profileId: "p1",
  emrid: "EMR-1",
  firstName: "Test",
  lastName: "Person",
  dateOfBirth: "1990-01-01",
  status: "ACTIVE",
  verificationLevel: "UNVERIFIED",
  identityVerificationStatus: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("DynamoProfileRepository", () => {
  it("getProfile sends a GetCommand with the correct key", async () => {
    const { deps, sent } = fakeDeps(() => ({ Item: profileItem(seedProfile) }));
    const repo = new DynamoProfileRepository(deps);
    const result = await repo.getProfile("p1");
    expect(result?.firstName).toBe("Test");
    expect(sent[0]!.name).toBe("GetCommand");
    expect(sent[0]!.input.Key).toEqual({ PK: "PROFILE#p1", SK: "PROFILE" });
  });

  it("setIdentityDecision VERIFIED sends a conditional UpdateCommand", async () => {
    const { deps, sent } = fakeDeps((name) =>
      name === "UpdateCommand"
        ? {}
        : { Item: profileItem({ ...seedProfile, identityVerificationStatus: "VERIFIED", verificationLevel: "IDENTITY_VERIFIED" }) },
    );
    const repo = new DynamoProfileRepository(deps);
    const updated = await repo.setIdentityDecision("p1", {
      decision: "VERIFIED",
      decidedByOpsUserId: "ops-1",
    });
    expect(updated.identityVerificationStatus).toBe("VERIFIED");
    const update = sent.find((c) => c.name === "UpdateCommand")!;
    expect(update.input.ConditionExpression).toBe("attribute_exists(PK)");
    const values = update.input.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[":status"]).toBe("VERIFIED");
    expect(values[":level"]).toBe("IDENTITY_VERIFIED");
  });

  it("listByIdentityStatus fails closed (no index on the shared table)", async () => {
    const { deps } = fakeDeps(() => ({}));
    await expect(
      new DynamoProfileRepository(deps).listByIdentityStatus("PENDING"),
    ).rejects.toThrow(/access-pattern/i);
  });
});

describe("DynamoAuditRepository", () => {
  it("record is append-only (attribute_not_exists) with correct keys", async () => {
    const { deps, sent } = fakeDeps(() => ({}));
    await new DynamoAuditRepository(deps).record({
      eventType: "IDENTITY_VERIFIED",
      actorType: "OPS",
      actorId: "ops-1",
      targetType: "PROFILE",
      targetId: "p1",
    });
    const put = sent.find((c) => c.name === "PutCommand")!;
    expect(put.input.ConditionExpression).toBe("attribute_not_exists(PK)");
    const item = put.input.Item as Record<string, unknown>;
    expect(item.PK).toBe("AUDIT#PROFILE#p1");
    expect(item.GSI2PK).toBe("PROFILE#p1");
  });

  it("listForProfile queries GSI2 newest-first", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoAuditRepository(deps).listForProfile("p1");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.IndexName).toBe("GSI2");
    expect(q.input.ScanIndexForward).toBe(false);
  });
});

describe("DynamoDocumentRepository", () => {
  it("listForProfile queries the profile partition for DOCUMENT# items", async () => {
    const { deps, sent } = fakeDeps(() => ({ Items: [] }));
    await new DynamoDocumentRepository(deps).listForProfile("p1");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    const values = q.input.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[":pk"]).toBe("PROFILE#p1");
    expect(values[":sk"]).toBe("DOCUMENT#");
  });
});

describe("DynamoEmergencyProfileRepository", () => {
  it("getEmergencyProfile sends a GetCommand keyed PROFILE#<id> / SK=EMERGENCY", async () => {
    const { deps, sent } = fakeDeps(() => ({
      Item: emergencyItem({
        profileId: "p1",
        bloodType: { value: "A-", visibility: "PUBLIC_EMERGENCY" },
        updatedAt: "2026-06-28T08:00:00.000Z",
      }),
    }));
    const result = await new DynamoEmergencyProfileRepository(
      deps,
    ).getEmergencyProfile("p1");
    expect(result?.bloodType?.value).toBe("A-");
    expect(sent[0]!.name).toBe("GetCommand");
    expect(sent[0]!.input.Key).toEqual({ PK: "PROFILE#p1", SK: "EMERGENCY" });
  });

  it("returns null when there is no emergency item", async () => {
    const { deps } = fakeDeps(() => ({}));
    expect(
      await new DynamoEmergencyProfileRepository(deps).getEmergencyProfile("p1"),
    ).toBeNull();
  });

  it("never issues a ScanCommand (no-scan law)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Item: undefined }));
    await new DynamoEmergencyProfileRepository(deps).getEmergencyProfile("p1");
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });
});
