import { beforeEach, describe, it, expect } from "vitest";
import {
  MAX_NOTE_LENGTH,
  buildOpsNote,
  validateNoteBody,
} from "@/lib/notes/core";
import {
  buildSupportQueryItem,
  supportQueryNoteBody,
  validateSupportQuery,
} from "@/lib/work/support-core";
import { activeWork, workHistory } from "@/lib/work/projections";
import { MockNoteRepository } from "@/lib/data/mock/note-repository";
import { DynamoNoteRepository } from "@/lib/data/aws/note-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { DynamoPractitionerRepository } from "@/lib/data/aws/practitioner-repository";
import { itemToOpsNote, opsNoteItem } from "@/lib/data/aws/keys";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { DynamoDeps } from "@/lib/data/aws/client";
import type { OpsNote } from "@/lib/data/entities";
import type { WorkItem } from "@/lib/work/types";

const NOW = "2026-07-03T13:00:00.000Z";

beforeEach(() => resetStore());

function note(overrides: Partial<OpsNote> = {}): OpsNote {
  return {
    noteId: "note-1",
    subjectId: "CUS-1",
    authorId: "ops-1",
    authorName: "Test Officer",
    body: "Called the customer.",
    createdAt: NOW,
    ...overrides,
  };
}

// ── Pure cores ─────────────────────────────────────────────────────────────────

describe("notes core (pure)", () => {
  it("rejects empty and oversized bodies, accepts normal ones", () => {
    expect(validateNoteBody("   ")).toMatch(/empty/i);
    expect(validateNoteBody("x".repeat(MAX_NOTE_LENGTH + 1))).toMatch(/limited/i);
    expect(validateNoteBody("Spoke to the customer.")).toBeNull();
  });

  it("buildOpsNote trims the body and carries attribution", () => {
    const built = buildOpsNote({
      noteId: "n1",
      subjectId: "CUS-1",
      authorId: "ops-1",
      authorName: "Test Officer",
      body: "  hello  ",
      now: NOW,
    });
    expect(built.body).toBe("hello");
    expect(built.authorName).toBe("Test Officer");
    expect(built.createdAt).toBe(NOW);
  });
});

describe("support core (pure)", () => {
  it("validates the query text", () => {
    expect(validateSupportQuery("")).toMatch(/describe/i);
    expect(validateSupportQuery("Card not scanning")).toBeNull();
  });

  it("builds a RESOLVE_SUPPORT_QUERY item from the type meta (One Work Engine)", () => {
    const item = buildSupportQueryItem({
      workItemId: "CUS-1-support-abc",
      customerId: "CUS-1",
      subjectName: "Robyn Holmes",
      now: NOW,
    });
    expect(item.workType).toBe("RESOLVE_SUPPORT_QUERY");
    expect(item.workDomain).toBe("SUPPORT");
    expect(item.status).toBe("OPEN");
    expect(item.priority).toBe("MEDIUM"); // meta default
    expect(item.source).toBe("CUSTOMER_REQUEST");
    expect(item.assignment).toEqual({ assigneeName: null });
    expect(item.subjectName).toBe("Robyn Holmes");
    expect(new Date(item.dueAt).getTime()).toBeGreaterThan(new Date(NOW).getTime());
  });

  it("captures the full query text in the note body", () => {
    expect(supportQueryNoteBody("  Card not scanning  ")).toBe(
      "Support query logged: Card not scanning",
    );
  });
});

describe("workHistory projection", () => {
  const base: Omit<WorkItem, "id" | "status" | "createdAt"> = {
    type: "RESOLVE_SUPPORT_QUERY",
    domain: "SUPPORT",
    title: "Resolve support query",
    subjectName: "Robyn",
    customerId: "CUS-1",
    priority: "MEDIUM",
    assignment: { assigneeName: null },
    source: "CUSTOMER_REQUEST",
    dueDate: NOW,
    nextAction: "Respond to the customer",
  };
  const items: WorkItem[] = [
    { ...base, id: "w1", status: "OPEN", createdAt: "2026-07-01T00:00:00.000Z" },
    { ...base, id: "w2", status: "DONE", createdAt: "2026-06-01T00:00:00.000Z" },
    { ...base, id: "w3", status: "CANCELLED", createdAt: "2026-06-15T00:00:00.000Z" },
  ];

  it("returns only terminal items, newest first; activeWork excludes them", () => {
    expect(workHistory(items, "CUS-1").map((w) => w.id)).toEqual(["w3", "w2"]);
    expect(activeWork(items, "CUS-1").map((w) => w.id)).toEqual(["w1"]);
    expect(workHistory(items, "CUS-other")).toEqual([]);
  });
});

// ── Note persistence ───────────────────────────────────────────────────────────

describe("notes (mock repo)", () => {
  it("adds and lists newest-first; idempotent on noteId", async () => {
    const repo = new MockNoteRepository();
    await repo.add(note({ noteId: "n1", createdAt: "2026-07-01T00:00:00.000Z" }));
    await repo.add(note({ noteId: "n2", createdAt: "2026-07-02T00:00:00.000Z" }));
    await repo.add(note({ noteId: "n1", createdAt: "2026-07-01T00:00:00.000Z" }));
    const listed = await repo.listForSubject("CUS-1");
    expect(listed.map((n) => n.noteId)).toEqual(["n2", "n1"]);
    expect(await repo.listForSubject("CUS-other")).toEqual([]);
  });
});

describe("notes (dynamo command shapes)", () => {
  type Captured = { name: string; input: Record<string, unknown> };
  function fake(respond: (name: string) => unknown): {
    deps: DynamoDeps;
    sent: Captured[];
  } {
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

  it("add is a conditional Put in the subject's PROFILE# partition", async () => {
    const { deps, sent } = fake(() => ({}));
    await new DynamoNoteRepository(deps).add(note());
    const put = sent.find((c) => c.name === "PutCommand")!;
    expect(put.input.ConditionExpression).toBe("attribute_not_exists(PK)");
    expect(put.input.Item).toMatchObject({
      PK: "PROFILE#CUS-1",
      SK: `OPSNOTE#${NOW}#note-1`,
      type: "OPS_NOTE",
      authorName: "Test Officer",
    });
  });

  it("listForSubject queries OPSNOTE# descending (newest first, no scan)", async () => {
    const { deps, sent } = fake(() => ({ Items: [opsNoteItem(note())] }));
    const listed = await new DynamoNoteRepository(deps).listForSubject("CUS-1");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.ExpressionAttributeValues).toMatchObject({
      ":pk": "PROFILE#CUS-1",
      ":sk": "OPSNOTE#",
    });
    expect(q.input.ScanIndexForward).toBe(false);
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
    expect(listed[0]).toEqual(note());
  });

  it("OPSNOTE item round-trips", () => {
    expect(itemToOpsNote(opsNoteItem(note()))).toEqual(note());
  });
});

// ── Practitioner links (inverse grant read) ────────────────────────────────────

describe("customer's practitioner grants (inverse read)", () => {
  it("mock: filters all grants by profileId", async () => {
    mockStore.practitionerAccess.set("prac-9001", [
      {
        accessId: "a1",
        practitionerId: "prac-9001",
        profileId: "CUS-1",
        grantedAt: NOW,
        status: "ACTIVE",
      },
      {
        accessId: "a2",
        practitionerId: "prac-9001",
        profileId: "CUS-2",
        grantedAt: NOW,
        status: "ACTIVE",
      },
    ]);
    const grants = await new MockPractitionerRepository().listAccessForProfile("CUS-1");
    expect(grants).toHaveLength(1);
    expect(grants[0]!.practitionerId).toBe("prac-9001");
  });

  it("dynamo: queries the PROFILE# partition for PRACTITIONER# grants (no scan)", async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const deps: DynamoDeps = {
      table: "emrid-test",
      doc: {
        send: (async (c: { constructor: { name: string }; input: Record<string, unknown> }) => {
          sent.push({ name: c.constructor.name, input: c.input });
          return { Items: [] };
        }) as DynamoDeps["doc"]["send"],
      },
    };
    await new DynamoPractitionerRepository(deps).listAccessForProfile("CUS-1");
    const q = sent.find((c) => c.name === "QueryCommand")!;
    expect(q.input.ExpressionAttributeValues).toMatchObject({
      ":pk": "PROFILE#CUS-1",
      ":sk": "PRACTITIONER#",
    });
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });
});
