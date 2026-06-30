import { beforeEach, describe, it, expect } from "vitest";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { DynamoAggregateRepository } from "@/lib/data/aws/aggregate-repository";
import { resetStore } from "@/lib/data/mock/store";
import { runProtectedLivesEngine } from "@/lib/engines/protected-lives";
import {
  crossesProtectedBoundary,
  protectedLivesDelta,
} from "@/lib/protection/aggregate";
import type { DynamoDeps } from "@/lib/data/aws/client";

beforeEach(() => resetStore());

// ── Pure delta (boundary rule) ────────────────────────────────────────────────

describe("protectedLivesDelta", () => {
  it("increments on a crossing INTO protected (from in_progress)", () => {
    expect(protectedLivesDelta("IN_PROGRESS", "PROTECTED")).toEqual({
      protected: 1,
      inProgress: -1,
    });
  });

  it("decrements on a crossing OUT of protected", () => {
    expect(protectedLivesDelta("PROTECTED", "IN_PROGRESS")).toEqual({
      protected: -1,
      inProgress: 1,
    });
  });

  it("is a no-op when the status is unchanged", () => {
    expect(protectedLivesDelta("IN_PROGRESS", "IN_PROGRESS")).toEqual({
      protected: 0,
      inProgress: 0,
    });
  });

  it("is a no-op for a change that does not touch the Protected boundary", () => {
    const d = protectedLivesDelta("UNPROTECTED", "IN_PROGRESS");
    expect(d).toEqual({ protected: 0, inProgress: 0 });
    expect(crossesProtectedBoundary(d)).toBe(false);
  });
});

// ── Mock adapter ──────────────────────────────────────────────────────────────

describe("MockAggregateRepository", () => {
  it("reads the seeded aggregate (counts from the fixture states)", async () => {
    const a = await new MockAggregateRepository().getProtectedLives();
    expect(a.protectedCount).toBe(3); // CUS-2043, 2046, 2049
    expect(a.inProgressCount).toBe(5);
  });

  it("applies a signed delta and bumps version/lastUpdatedAt", async () => {
    const repo = new MockAggregateRepository();
    const before = await repo.getProtectedLives();
    const after = await repo.adjustProtectedLives({ protected: 1, inProgress: -1 });
    expect(after.protectedCount).toBe(before.protectedCount + 1);
    expect(after.inProgressCount).toBe(before.inProgressCount - 1);
    expect(after.version).toBe(before.version + 1);
    expect(after.lastUpdatedAt).toBeTruthy();
  });

  it("clamps counters at zero", async () => {
    const repo = new MockAggregateRepository();
    const after = await repo.adjustProtectedLives({
      protected: -999,
      inProgress: -999,
    });
    expect(after.protectedCount).toBe(0);
    expect(after.inProgressCount).toBe(0);
  });
});

// ── DynamoDB adapter (fake doc.send; no AWS) ──────────────────────────────────

type Captured = { name: string; input: Record<string, unknown> };
function fakeDeps(
  respond: (name: string, input: Record<string, unknown>) => unknown,
): { deps: DynamoDeps; sent: Captured[] } {
  const sent: Captured[] = [];
  const deps: DynamoDeps = {
    table: "emrid-test",
    doc: {
      send: (async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        sent.push({ name: command.constructor.name, input: command.input });
        return respond(command.constructor.name, command.input);
      }) as DynamoDeps["doc"]["send"],
    },
  };
  return { deps, sent };
}

describe("DynamoAggregateRepository", () => {
  it("getProtectedLives sends a GetCommand on the aggregate key (no scan)", async () => {
    const { deps, sent } = fakeDeps(() => ({ Item: undefined }));
    const result = await new DynamoAggregateRepository(deps).getProtectedLives();
    expect(sent[0]!.name).toBe("GetCommand");
    expect(sent[0]!.input.Key).toEqual({
      PK: "AGGREGATE#PROTECTED_LIVES",
      SK: "CURRENT",
    });
    // Missing item → safe zeroed aggregate.
    expect(result.protectedCount).toBe(0);
    expect(sent.some((c) => c.name === "ScanCommand")).toBe(false);
  });

  it("adjustProtectedLives issues an atomic ADD UpdateCommand", async () => {
    const { deps, sent } = fakeDeps(() => ({
      Attributes: {
        PK: "AGGREGATE#PROTECTED_LIVES",
        SK: "CURRENT",
        protectedCount: 4,
        inProgressCount: 4,
        version: 1,
        lastUpdatedAt: "2026-06-30T00:00:00.000Z",
      },
    }));
    const result = await new DynamoAggregateRepository(deps).adjustProtectedLives({
      protected: 1,
      inProgress: -1,
    });
    const update = sent.find((c) => c.name === "UpdateCommand")!;
    expect(update.input.Key).toEqual({
      PK: "AGGREGATE#PROTECTED_LIVES",
      SK: "CURRENT",
    });
    expect(String(update.input.UpdateExpression)).toContain("ADD");
    const values = update.input.ExpressionAttributeValues as Record<string, unknown>;
    expect(values[":p"]).toBe(1);
    expect(values[":ip"]).toBe(-1);
    expect(values[":one"]).toBe(1);
    expect(result.protectedCount).toBe(4);
  });
});

// ── Engine contract ───────────────────────────────────────────────────────────

describe("runProtectedLivesEngine (Mission Control reads the aggregate)", () => {
  it("maps the aggregate onto the hero contract", () => {
    const out = runProtectedLivesEngine({
      protectedCount: 12,
      inProgressCount: 8,
      lastUpdatedAt: "2026-06-30T00:00:00.000Z",
      version: 3,
    });
    expect(out.protected).toBe(12);
    expect(out.total).toBe(20); // protected + in-progress
    expect(out.weeklyDelta).toBe(0); // not tracked yet → honest zero/flat
    expect(out.direction).toBe("flat");
  });

  it("is safe for a missing aggregate", () => {
    const out = runProtectedLivesEngine(null);
    expect(out.protected).toBe(0);
    expect(out.total).toBe(0);
  });
});
