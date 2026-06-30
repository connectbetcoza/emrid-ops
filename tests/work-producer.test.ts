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
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { Profile } from "@/lib/data/entities";

const NOW = "2026-06-30T10:00:00.000Z";

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
    const deps = {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
    };
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
    const deps = {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
    };
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
    const deps = {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
    };
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
    const deps = {
      workRepo: new MockWorkItemRepository(),
      profileRepo: new MockProfileRepository(),
    };
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
