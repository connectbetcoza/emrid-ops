import { beforeEach, describe, it, expect } from "vitest";
import {
  correctedFields,
  correctionNoteBody,
  executeContactCorrection,
  validateContactCorrection,
  type ContactCorrectionInput,
} from "@/lib/customers/contact-correction";
import { customerSummary } from "@/lib/customers/workspace";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { DynamoProfileRepository } from "@/lib/data/aws/profile-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockNoteRepository } from "@/lib/data/mock/note-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type { Customer } from "@/lib/customers/types";

const NOW = "2026-08-15T10:00:00.000Z";
const ACTOR = {
  userId: "ops-1",
  fullName: "Test Officer",
  roles: ["CUSTOMER_SUPPORT"] as const,
};

const NEW_EMAIL = "new.address@example.com";
const NEW_MOBILE = "+27 82 111 2222";

beforeEach(() => resetStore());

function valid(over: Partial<ContactCorrectionInput> = {}): ContactCorrectionInput {
  return {
    contactEmail: NEW_EMAIL,
    verifiedVia: "PHONE_CALLBACK",
    reason: "Customer reported a typo in their email.",
    ...over,
  };
}

function mockProfile(profileId: string) {
  const existing = [...mockStore.profiles.values()][0]!;
  mockStore.profiles.set(profileId, { ...existing, profileId });
}

function deps() {
  return {
    profileRepo: new MockProfileRepository(),
    auditRepo: new MockAuditRepository(),
    noteRepo: new MockNoteRepository(),
  };
}

describe("validation (mandated tests 1–2)", () => {
  it("1. rejects a missing/unknown verification method", () => {
    expect(validateContactCorrection(valid({ verifiedVia: "" }))).toMatch(/verified/i);
    expect(validateContactCorrection(valid({ verifiedVia: "VIBES" }))).toMatch(/verified/i);
  });

  it("2. rejects a missing reason", () => {
    expect(validateContactCorrection(valid({ reason: "   " }))).toMatch(/reason/i);
  });

  it("rejects no-field and malformed inputs", () => {
    expect(
      validateContactCorrection(valid({ contactEmail: undefined, contactMobile: undefined })),
    ).toMatch(/email and\/or mobile/i);
    expect(validateContactCorrection(valid({ contactEmail: "not-an-email" }))).toMatch(/email/i);
    expect(validateContactCorrection(valid({ contactMobile: "abc" }))).toMatch(/mobile/i);
  });
});

describe("write path (mandated tests 3–6, 10)", () => {
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
  const attrs = {
    Attributes: {
      profileId: "p1", emrid: "EMR-1", firstName: "T", lastName: "P",
      dateOfBirth: "1990-01-01", status: "ACTIVE", verificationLevel: "UNVERIFIED",
      createdAt: NOW, updatedAt: NOW,
    },
  };

  it("3. email-only update writes ONLY contactEmail (+updatedAt), conditional on existence", async () => {
    const { deps, sent } = fake(() => attrs);
    await new DynamoProfileRepository(deps).updateContactDetails("p1", {
      contactEmail: NEW_EMAIL,
    });
    const upd = sent[0]!;
    expect(upd.name).toBe("UpdateCommand");
    expect(upd.input.ConditionExpression).toBe("attribute_exists(PK)");
    const expr = String(upd.input.UpdateExpression);
    expect(expr).toContain("contactEmail");
    expect(expr).not.toContain("contactMobile");
    expect(expr).toContain("updatedAt");
  });

  it("4. mobile-only update writes ONLY contactMobile (+updatedAt)", async () => {
    const { deps, sent } = fake(() => attrs);
    await new DynamoProfileRepository(deps).updateContactDetails("p1", {
      contactMobile: NEW_MOBILE,
    });
    const expr = String(sent[0]!.input.UpdateExpression);
    expect(expr).toContain("contactMobile");
    expect(expr).not.toContain("contactEmail");
  });

  it("5. combined correction writes only the two allowed fields", async () => {
    const { deps, sent } = fake(() => attrs);
    await new DynamoProfileRepository(deps).updateContactDetails("p1", {
      contactEmail: NEW_EMAIL,
      contactMobile: NEW_MOBILE,
    });
    const expr = String(sent[0]!.input.UpdateExpression);
    expect(expr).toBe("SET contactEmail = :ce, contactMobile = :cm, updatedAt = :ts");
  });

  it("10. name/DOB (or any other field) can NEVER enter the update path", async () => {
    const { deps, sent } = fake(() => attrs);
    // Even a hostile/buggy caller smuggling extra keys past the type system
    // cannot widen the write — the expression is whitelist-built.
    await new DynamoProfileRepository(deps).updateContactDetails("p1", {
      contactEmail: NEW_EMAIL,
      firstName: "Hacked",
      dateOfBirth: "2000-01-01",
      identityVerificationStatus: "VERIFIED",
    } as never);
    const expr = String(sent[0]!.input.UpdateExpression);
    expect(expr).not.toContain("firstName");
    expect(expr).not.toContain("dateOfBirth");
    expect(expr).not.toContain("identityVerificationStatus");
    expect(expr).toBe("SET contactEmail = :ce, updatedAt = :ts");
  });

  it("6. missing profile fails closed (orchestrator + mock repo)", async () => {
    const d = deps();
    const result = await executeContactCorrection(d, {
      profileId: "profile-does-not-exist",
      input: valid(),
      actor: ACTOR,
      noteId: "note-1",
      now: NOW,
    });
    expect(result).toEqual({ ok: false, error: "Customer not found." });
    expect(await d.auditRepo.listForProfile("profile-does-not-exist")).toEqual([]);
  });
});

describe("audit + note (mandated tests 7–9)", () => {
  it("7+8. audits PROFILE_UPDATED (OPS) with field names + method — and NO PII values", async () => {
    const d = deps();
    mockProfile("p-test");
    const result = await executeContactCorrection(d, {
      profileId: "p-test",
      input: valid({ contactMobile: NEW_MOBILE }),
      actor: ACTOR,
      noteId: "note-1",
      now: NOW,
    });
    expect(result.ok).toBe(true);

    const events = await d.auditRepo.listForProfile("p-test");
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.eventType).toBe("PROFILE_UPDATED");
    expect(event.actorType).toBe("OPS");
    expect(event.actorId).toBe("ops-1");
    expect(event.metadata).toEqual({
      fields: ["contactEmail", "contactMobile"],
      verifiedVia: "PHONE_CALLBACK",
    });
    // The invariant, pinned: no old/new values anywhere in the event.
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(NEW_EMAIL);
    expect(serialized).not.toContain(NEW_MOBILE);
    expect(serialized).not.toContain("82 111");
  });

  it("9. a support note is created — method + reason, no PII values", async () => {
    const d = deps();
    mockProfile("p-test");
    await executeContactCorrection(d, {
      profileId: "p-test",
      input: valid(),
      actor: ACTOR,
      noteId: "note-1",
      now: NOW,
    });
    const notes = await d.noteRepo.listForSubject("p-test");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.authorName).toBe("Test Officer");
    expect(notes[0]!.body).toContain("contact email");
    expect(notes[0]!.body).toContain("Phone callback");
    expect(notes[0]!.body).toContain("typo in their email");
    expect(notes[0]!.body).not.toContain(NEW_EMAIL);
  });

  it("the write actually persists through the mock repo", async () => {
    const d = deps();
    mockProfile("p-test");
    await executeContactCorrection(d, {
      profileId: "p-test",
      input: valid({ contactMobile: NEW_MOBILE }),
      actor: ACTOR,
      noteId: "note-1",
      now: NOW,
    });
    const updated = await d.profileRepo.getProfile("p-test");
    expect(updated?.contactEmail).toBe(NEW_EMAIL);
    expect(updated?.contactMobile).toBe(NEW_MOBILE);
  });
});

describe("summary completeness (mandated tests 11–12)", () => {
  const customer: Customer = {
    id: "CUS-1",
    fullName: "Test Person",
    emrid: "EMR-TEST1",
    accountStatus: "ACTIVE",
    email: "t@example.com",
    joinedAt: NOW,
    profileComplete: true,
    identityStatus: "VERIFIED",
    emergencyInfoComplete: true,
    emergencyContactsCount: 1,
    cardStatus: "ACTIVE",
  };

  it("11. summary renders EMRID + account status", () => {
    const labels = customerSummary(customer).map((i) => [i.label, i.value]);
    expect(labels).toContainEqual(["EMRID", "EMR-TEST1"]);
    expect(labels).toContainEqual(["Account", "Active"]);
  });

  it("12. existing summary fields are intact (email/mobile/joined/identity/card)", () => {
    const labels = customerSummary(customer).map((i) => i.label);
    expect(labels).toEqual([
      "EMRID",
      "Account",
      "Email",
      "Mobile",
      "Joined",
      "Identity",
      "Card",
    ]);
  });

  it("renders honestly when the fields are unavailable (directory path)", () => {
    const bare = { ...customer, emrid: undefined, accountStatus: undefined };
    const labels = customerSummary(bare).map((i) => [i.label, i.value]);
    expect(labels).toContainEqual(["EMRID", "—"]);
    expect(labels).toContainEqual(["Account", "—"]);
  });
});

describe("note body helper", () => {
  it("names fields without leaking values", () => {
    const body = correctionNoteBody(valid({ contactMobile: NEW_MOBILE }));
    expect(body).toContain("contact email and contact mobile");
    expect(body).not.toContain(NEW_EMAIL);
    expect(body).not.toContain(NEW_MOBILE);
    expect(correctedFields(valid())).toEqual(["contactEmail"]);
  });
});
