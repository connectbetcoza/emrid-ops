import { beforeEach, describe, it, expect } from "vitest";
import {
  ACCESS_BY_PROFILE_PREFIX,
  FAMILY_INVITE_PREFIX_SK,
  MEMBERSHIP_SK,
  PATIENT_BY_PRACTITIONER_PREFIX,
  OPSNOTE_PREFIX_SK,
  itemToFamilyInviteSummary,
  itemToMembership,
  itemToProfileAccess,
  userPk,
} from "@/lib/data/aws/keys";
import {
  ROLE_LABEL,
  inviteState,
  splitFamilyAccess,
} from "@/lib/customers/family";
import { auditTimeline } from "@/lib/customers/audit-timeline";
import { MockFamilyRepository } from "@/lib/data/mock/family-repository";
import { DynamoFamilyRepository } from "@/lib/data/aws/family-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type {
  FamilyInviteSummary,
  Membership,
  ProfileAccessEntry,
} from "@/lib/data/entities";

const NOW = "2026-08-15T09:00:00.000Z";

beforeEach(() => resetStore());

// ── Key contract pins (mirror of the Patient Platform's keys.ts) ──────────────

describe("family/membership key contract", () => {
  it("pins the exact key strings", () => {
    expect(ACCESS_BY_PROFILE_PREFIX).toBe("ACCESS#USER#");
    expect(FAMILY_INVITE_PREFIX_SK).toBe("FAMILY_INVITE#");
    expect(MEMBERSHIP_SK).toBe("MEMBERSHIP");
    expect(userPk("u1")).toBe("USER#u1");
  });

  it("preserves prefix separation inside the PROFILE partition", () => {
    // The Patient code relies on "PRACTITIONER#" (with the #) EXCLUDING the
    // "PRACTITIONER_CODE" item — pin the assumption Ops inherits.
    expect("PRACTITIONER_CODE".startsWith(PATIENT_BY_PRACTITIONER_PREFIX)).toBe(false);
    expect("PRACTITIONER_CODE".startsWith("PRACTITIONER#")).toBe(false);
    // The new prefixes must never match each other's items or existing ones.
    const prefixes = [
      ACCESS_BY_PROFILE_PREFIX,
      FAMILY_INVITE_PREFIX_SK,
      OPSNOTE_PREFIX_SK,
      "PRACTITIONER#",
      "WORK#",
      "DEVICE#",
      "DOCUMENT#",
    ];
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b) expect(a.startsWith(b)).toBe(false);
      }
    }
    // MEMBERSHIP lives in the USER partition, not PROFILE — no collision.
    expect(prefixes.some((p) => MEMBERSHIP_SK.startsWith(p))).toBe(false);
  });
});

// ── Reconstructors ─────────────────────────────────────────────────────────────

const storedInviteItem = {
  PK: "PROFILE#p1",
  SK: "FAMILY_INVITE#inv-1",
  type: "FAMILY_INVITE",
  inviteId: "inv-1",
  profileId: "p1",
  inviteEmail: "sib@example.com",
  role: "VIEWER",
  invitedByUserId: "owner-sub",
  token: "fam_SECRETSECRETSECRETSECRETSECR", // stored on the Patient item
  expiresAt: "2026-08-29T09:00:00.000Z",
  createdAt: NOW,
};

describe("reconstructors", () => {
  it("itemToFamilyInviteSummary NEVER carries the bearer token", () => {
    const summary = itemToFamilyInviteSummary(storedInviteItem);
    expect("token" in summary).toBe(false);
    expect(JSON.stringify(summary)).not.toContain("fam_");
    expect(summary).toEqual({
      inviteId: "inv-1",
      profileId: "p1",
      inviteEmail: "sib@example.com",
      role: "VIEWER",
      invitedByUserId: "owner-sub",
      expiresAt: "2026-08-29T09:00:00.000Z",
      createdAt: NOW,
    });
  });

  it("itemToProfileAccess and itemToMembership round-trip their fields", () => {
    const access = itemToProfileAccess({
      accessId: "a1",
      profileId: "p1",
      userId: "u1",
      role: "GUARDIAN",
      memberEmail: "g@example.com",
      createdAt: NOW,
    });
    expect(access.role).toBe("GUARDIAN");
    expect(access.memberEmail).toBe("g@example.com");

    const membership = itemToMembership({
      membershipId: "m1",
      userId: "u1",
      plan: "FAMILY",
      status: "PENDING_PAYMENT",
      billingCycle: "ANNUAL",
      priceRands: 2000,
      paymentRef: "EMR-PAY-ABCDEFGH",
      startedAt: NOW,
      renewalDate: "2027-08-15T09:00:00.000Z",
      updatedAt: NOW,
    });
    expect(membership.plan).toBe("FAMILY");
    expect(membership.priceRands).toBe(2000);
    expect(membership.status).toBe("PENDING_PAYMENT");
  });
});

// ── Dynamo command shapes (fake doc.send — no AWS) ────────────────────────────

describe("DynamoFamilyRepository (command shapes, no scan)", () => {
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

  it("listFamilyAccess queries the PROFILE partition ACCESS#USER# prefix", async () => {
    const { deps, sent } = fake(() => ({ Items: [] }));
    await new DynamoFamilyRepository(deps).listFamilyAccess("p1");
    const q = sent[0]!;
    expect(q.name).toBe("QueryCommand");
    expect(q.input.ExpressionAttributeValues).toMatchObject({
      ":pk": "PROFILE#p1",
      ":sk": "ACCESS#USER#",
    });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("listFamilyInvites queries FAMILY_INVITE# and strips tokens", async () => {
    const { deps, sent } = fake(() => ({ Items: [storedInviteItem] }));
    const invites = await new DynamoFamilyRepository(deps).listFamilyInvites("p1");
    expect(sent[0]!.input.ExpressionAttributeValues).toMatchObject({
      ":sk": "FAMILY_INVITE#",
    });
    expect(JSON.stringify(invites)).not.toContain("fam_");
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("getMembershipForProfile = bounded owner Query + one GetItem", async () => {
    const { deps, sent } = fake((name) => {
      if (name === "QueryCommand") {
        return {
          Items: [
            { accessId: "a1", profileId: "p1", userId: "owner-1", role: "OWNER", createdAt: NOW },
            { accessId: "a2", profileId: "p1", userId: "g-1", role: "GUARDIAN", createdAt: NOW },
          ],
        };
      }
      return {
        Item: {
          membershipId: "m1", userId: "owner-1", plan: "SPOUSAL",
          status: "ACTIVE", billingCycle: "MONTHLY", priceRands: 80,
          startedAt: NOW, updatedAt: NOW,
        },
      };
    });
    const membership = await new DynamoFamilyRepository(deps).getMembershipForProfile("p1");
    expect(membership?.plan).toBe("SPOUSAL");
    const get = sent.find((c) => c.name === "GetCommand")!;
    expect(get.input.Key).toEqual({ PK: "USER#owner-1", SK: "MEMBERSHIP" });
    expect(sent).toHaveLength(2); // exactly two bounded reads
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("getMembershipForProfile returns null when the profile has no OWNER", async () => {
    const { deps, sent } = fake(() => ({ Items: [] }));
    const membership = await new DynamoFamilyRepository(deps).getMembershipForProfile("p1");
    expect(membership).toBeNull();
    expect(sent).toHaveLength(1); // never reaches the GetItem
  });
});

// ── Mock adapter parity ────────────────────────────────────────────────────────

describe("MockFamilyRepository", () => {
  it("resolves membership via the OWNER grant, like the Dynamo adapter", async () => {
    const access: ProfileAccessEntry[] = [
      { accessId: "a1", profileId: "p1", userId: "owner-1", role: "OWNER", createdAt: NOW },
      { accessId: "a2", profileId: "p1", userId: "v-1", role: "VIEWER", createdAt: NOW },
    ];
    const membership: Membership = {
      membershipId: "m1", userId: "owner-1", plan: "INDIVIDUAL",
      status: "ACTIVE", startedAt: NOW, updatedAt: NOW,
    };
    mockStore.profileAccess.set("p1", access);
    mockStore.memberships.set("owner-1", membership);

    const repo = new MockFamilyRepository();
    expect((await repo.listFamilyAccess("p1")).length).toBe(2);
    expect((await repo.getMembershipForProfile("p1"))?.membershipId).toBe("m1");
    expect(await repo.getMembershipForProfile("p-unknown")).toBeNull();
  });
});

// ── Pure display core ─────────────────────────────────────────────────────────

describe("family display core (pure)", () => {
  it("splitFamilyAccess separates the owner and sorts members by grant date", () => {
    const entries: ProfileAccessEntry[] = [
      { accessId: "a2", profileId: "p1", userId: "u2", role: "VIEWER", createdAt: "2026-08-02T00:00:00.000Z" },
      { accessId: "a1", profileId: "p1", userId: "u0", role: "OWNER", createdAt: "2026-08-01T00:00:00.000Z" },
      { accessId: "a3", profileId: "p1", userId: "u3", role: "GUARDIAN", createdAt: "2026-08-01T12:00:00.000Z" },
    ];
    const { owner, members } = splitFamilyAccess(entries);
    expect(owner?.userId).toBe("u0");
    expect(members.map((m) => m.userId)).toEqual(["u3", "u2"]);
  });

  it("inviteState derives expiry application-side", () => {
    const invite: FamilyInviteSummary = {
      inviteId: "i1", profileId: "p1", inviteEmail: "x@example.com",
      role: "VIEWER", invitedByUserId: "u0",
      expiresAt: "2026-08-20T00:00:00.000Z", createdAt: NOW,
    };
    expect(inviteState(invite, NOW)).toBe("PENDING");
    expect(inviteState(invite, "2026-08-21T00:00:00.000Z")).toBe("EXPIRED");
  });

  it("role labels are exhaustive", () => {
    expect(Object.keys(ROLE_LABEL).sort()).toEqual(
      ["ADMIN", "DEPENDENT", "GUARDIAN", "OWNER", "VIEWER"],
    );
  });
});

// ── Stage C: timeline labels stay curated and metadata stays ignored ──────────

describe("timeline alignment", () => {
  it("curates the new family/membership/consent/device/onboarding events", () => {
    const labels = auditTimeline(
      [
        "FAMILY_INVITE_ISSUED",
        "FAMILY_INVITE_CANCELLED",
        "PROFILE_ACCESS_GRANTED",
        "PROFILE_ACCESS_REVOKED",
        "MEMBERSHIP_PACKAGE_SELECTED",
        "DEVICE_SUSPENDED",
        "DEVICE_REACTIVATED",
        "DEVICE_REVOKED",
        "PRACTITIONER_ACCESS_GRANTED",
        "PRACTITIONER_ACCESS_REVOKED",
        "PRACTITIONER_PROFILE_VIEWED",
        "PRACTITIONER_DOCUMENT_DOWNLOADED",
        "PATIENT_ONBOARDED_BY_PRACTITIONER",
        "ONBOARDING_CLAIM_ISSUED",
        "ONBOARDING_PROFILE_CLAIMED",
      ].map((eventType, i) => ({
        eventId: `e${i}`,
        eventType,
        actorType: "USER" as const,
        targetType: "PROFILE" as const,
        targetId: "p1",
        timestamp: NOW,
      })),
    ).map((t) => t.title);
    expect(labels).toEqual([
      "Family invite sent",
      "Family invite cancelled",
      "Profile access granted",
      "Profile access removed",
      "Membership package selected",
      "Device suspended",
      "Device reactivated",
      "Device revoked",
      "Practitioner access granted",
      "Practitioner access revoked",
      "Record viewed by practitioner",
      "Document downloaded by practitioner",
      "Onboarded by practitioner",
      "Account claim link issued",
      "Account claimed by customer",
    ]);
  });

  it("NEVER renders metadata — a token in metadata cannot reach the timeline", () => {
    const rendered = auditTimeline([
      {
        eventId: "e1",
        eventType: "FAMILY_INVITE_ISSUED",
        actorType: "USER",
        targetType: "PROFILE",
        targetId: "p1",
        timestamp: NOW,
        metadata: { token: "fam_LEAKLEAKLEAK", code: "EMR-1234-5678-9012" },
      },
    ]);
    expect(JSON.stringify(rendered)).not.toContain("fam_");
    expect(JSON.stringify(rendered)).not.toContain("EMR-1234");
  });
});
