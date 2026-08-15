import { beforeEach, describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PERMISSION_DENIED_MESSAGE,
  PERMISSION_ROLES,
  WORK_DOMAIN_PERMISSION,
  ensurePermission,
  hasPermission,
  type Permission,
} from "@/lib/auth/permissions";
import { executeTransition } from "@/lib/work/transition-service";
import { executeContactCorrection } from "@/lib/customers/contact-correction";
import {
  executeAddNote,
  executeLogSupportQuery,
} from "@/lib/customers/support-service";
import { executeOnboardPractitioner } from "@/lib/practitioners/manage-service";
import { MockWorkItemRepository } from "@/lib/data/mock/work-repository";
import { MockProfileRepository } from "@/lib/data/mock/profile-repository";
import { MockDeviceRepository } from "@/lib/data/mock/device-repository";
import { MockEmergencyProfileRepository } from "@/lib/data/mock/emergency-profile-repository";
import { MockAggregateRepository } from "@/lib/data/mock/aggregate-repository";
import { MockAuditRepository } from "@/lib/data/mock/audit-repository";
import { MockNoteRepository } from "@/lib/data/mock/note-repository";
import { MockPractitionerRepository } from "@/lib/data/mock/practitioner-repository";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { OpsRole } from "@/types";

const NOW = "2026-08-15T11:00:00.000Z";

beforeEach(() => resetStore());

// ── Matrix pins (mandated 1–6) ────────────────────────────────────────────────

describe("permission matrix", () => {
  it("1. pins the EXACT approved matrix", () => {
    expect(PERMISSION_ROLES).toEqual({
      DECIDE_IDENTITY: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "IDENTITY_OFFICER"],
      PROCESS_FULFILMENT: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "FULFILMENT_OFFICER"],
      TRANSITION_READINESS_WORK: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
      RESOLVE_SUPPORT: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
      MANAGE_PRACTITIONERS: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "PRACTITIONER_MANAGER"],
      ADD_NOTES: [
        "SUPER_ADMIN",
        "OPERATIONS_ADMIN",
        "CUSTOMER_SUPPORT",
        "IDENTITY_OFFICER",
        "FULFILMENT_OFFICER",
        "PRACTITIONER_MANAGER",
      ],
      CORRECT_CONTACT_DETAILS: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
      ASSIST_DEVICES: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
      REVOKE_DEVICES: ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
      VIEW_ADMINISTRATION: ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
    });
  });

  it("2. SUPER_ADMIN is EXPLICITLY present in every permission row", () => {
    for (const roles of Object.values(PERMISSION_ROLES)) {
      expect(roles).toContain("SUPER_ADMIN");
    }
  });

  it("3. EXECUTIVE holds zero mutating permissions (zero permissions at all)", () => {
    for (const [permission, roles] of Object.entries(PERMISSION_ROLES)) {
      expect(roles, permission).not.toContain("EXECUTIVE");
      expect(hasPermission({ roles: ["EXECUTIVE"] }, permission as Permission)).toBe(false);
    }
  });

  it("4. multi-role users receive the union of their permissions", () => {
    const user = { roles: ["IDENTITY_OFFICER", "FULFILMENT_OFFICER"] as OpsRole[] };
    expect(hasPermission(user, "DECIDE_IDENTITY")).toBe(true);
    expect(hasPermission(user, "PROCESS_FULFILMENT")).toBe(true);
    expect(hasPermission(user, "MANAGE_PRACTITIONERS")).toBe(false);
    expect(hasPermission(user, "CORRECT_CONTACT_DETAILS")).toBe(false);
  });

  it("5. empty/unknown role sets fail closed", () => {
    for (const permission of Object.keys(PERMISSION_ROLES) as Permission[]) {
      expect(hasPermission({ roles: [] }, permission)).toBe(false);
      expect(hasPermission({ roles: ["patients" as OpsRole] }, permission)).toBe(false);
    }
    expect(ensurePermission({ roles: [] }, "ADD_NOTES")).toBe(PERMISSION_DENIED_MESSAGE);
  });

  it("6. every Work Domain maps to a permission (exhaustive)", () => {
    expect(WORK_DOMAIN_PERMISSION).toEqual({
      IDENTITY: "DECIDE_IDENTITY",
      FULFILMENT: "PROCESS_FULFILMENT",
      READINESS: "TRANSITION_READINESS_WORK",
      PRACTITIONER: "MANAGE_PRACTITIONERS",
      SUPPORT: "RESOLVE_SUPPORT",
    });
  });
});

// ── Denials perform ZERO writes (mandated 7–13) ───────────────────────────────

function transitionDeps() {
  return {
    workRepo: new MockWorkItemRepository(),
    profileRepo: new MockProfileRepository(),
    deviceRepo: new MockDeviceRepository(),
    auditRepo: new MockAuditRepository(),
    emergencyRepo: new MockEmergencyProfileRepository(),
    aggregateRepo: new MockAggregateRepository(),
    practitionerRepo: new MockPractitionerRepository(),
  };
}

function workRecord(over: Partial<WorkItemRecord>): WorkItemRecord {
  return {
    workItemId: "w-1",
    customerId: "CUS-2042",
    workType: "VERIFY_IDENTITY",
    workDomain: "IDENTITY",
    status: "OPEN",
    priority: "HIGH",
    step: 0,
    assignment: { assigneeName: null },
    source: "READINESS_GAP",
    title: "Verify identity",
    subjectName: "Test",
    nextAction: "Review",
    dueAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe("denied actors perform zero writes", () => {
  it("7. identity transition denied for EXECUTIVE — no work move, no audit, no profile write", async () => {
    const deps = transitionDeps();
    const before = mockStore.workItems.size;
    // The mock store pre-seeds audit (tap tests); assert NOTHING is added.
    const auditBefore = (await deps.auditRepo.listForProfile("CUS-2042")).length;
    const result = await executeTransition(deps, {
      current: workRecord({}),
      toStatus: "DONE",
      actor: { userId: "exec-1", roles: ["EXECUTIVE"] },
    });
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect(mockStore.workItems.size).toBe(before);
    expect((await deps.auditRepo.listForProfile("CUS-2042")).length).toBe(auditBefore);
  });

  it("8. fulfilment transition denied for IDENTITY_OFFICER (cross-domain) — zero writes", async () => {
    const deps = transitionDeps();
    const auditBefore = (await deps.auditRepo.listForProfile("CUS-2042")).length;
    const result = await executeTransition(deps, {
      current: workRecord({ workType: "ISSUE_CARD", workDomain: "FULFILMENT" }),
      toStatus: "DONE",
      actor: { userId: "id-1", roles: ["IDENTITY_OFFICER"] },
    });
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect((await deps.auditRepo.listForProfile("CUS-2042")).length).toBe(auditBefore);
    // The permission is derived from the item's TYPE meta, not the client
    // domain string: lying about workDomain cannot widen access.
    const spoofed = await executeTransition(deps, {
      current: workRecord({ workType: "ISSUE_CARD", workDomain: "IDENTITY" }),
      toStatus: "DONE",
      actor: { userId: "id-1", roles: ["IDENTITY_OFFICER"] },
    });
    expect(spoofed).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
  });

  it("9. support denial — no work item, no note, no audit", async () => {
    const noteRepo = new MockNoteRepository();
    const auditRepo = new MockAuditRepository();
    const workRepo = new MockWorkItemRepository();
    const workBefore = (await workRepo.listForCustomer("CUS-2042")).length;
    const result = await executeLogSupportQuery(
      { profileRepo: new MockProfileRepository(), workRepo, noteRepo, auditRepo },
      {
        customerId: "CUS-2042",
        description: "Card not scanning",
        actor: { userId: "id-1", fullName: "X", roles: ["IDENTITY_OFFICER"] },
        workItemId: "CUS-2042-support-x",
        noteId: "n-1",
        now: NOW,
      },
    );
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect(await noteRepo.listForSubject("CUS-2042")).toEqual([]);
    // Pre-seeded audit unchanged; note/work stores gained nothing.
    expect(
      (await auditRepo.listForProfile("CUS-2042")).some(
        (e) => e.metadata?.trigger === "SUPPORT_QUERY_LOGGED",
      ),
    ).toBe(false);
    expect((await workRepo.listForCustomer("CUS-2042")).length).toBe(workBefore);
  });

  it("10. practitioner-management denial — no practice, no practitioner, no audit", async () => {
    const practitionerRepo = new MockPractitionerRepository();
    const auditRepo = new MockAuditRepository();
    const before = mockStore.practitioners.size;
    const result = await executeOnboardPractitioner(
      { practitionerRepo, auditRepo },
      {
        input: {
          fullName: "Dr X",
          email: "x@y.z",
          practiceName: "P",
          practiceEmail: "p@y.z",
        },
        actor: { userId: "cs-1", roles: ["CUSTOMER_SUPPORT"] },
        practiceId: "prc-x",
        generatedPractitionerId: "prac_x",
      },
    );
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect(mockStore.practitioners.size).toBe(before);
    expect(mockStore.practices.has("prc-x")).toBe(false);
  });

  it("11. contact-correction denial — no profile write, no audit, no note", async () => {
    const profileRepo = new MockProfileRepository();
    const auditRepo = new MockAuditRepository();
    const noteRepo = new MockNoteRepository();
    const anyProfile = [...mockStore.profiles.keys()][0]!;
    const beforeEmail = (await profileRepo.getProfile(anyProfile))?.contactEmail;
    const result = await executeContactCorrection(
      { profileRepo, auditRepo, noteRepo },
      {
        profileId: anyProfile,
        input: {
          contactEmail: "denied@example.com",
          verifiedVia: "PHONE_CALLBACK",
          reason: "Should never apply",
        },
        actor: { userId: "id-1", fullName: "X", roles: ["IDENTITY_OFFICER"] },
        noteId: "n-1",
        now: NOW,
      },
    );
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect((await profileRepo.getProfile(anyProfile))?.contactEmail).toBe(beforeEmail);
    expect(await auditRepo.listForProfile(anyProfile)).toEqual([]);
    expect(await noteRepo.listForSubject(anyProfile)).toEqual([]);
  });

  it("12. internal-note denial (EXECUTIVE) — no note written", async () => {
    const noteRepo = new MockNoteRepository();
    const result = await executeAddNote(
      { noteRepo },
      {
        subjectId: "CUS-2042",
        body: "should not persist",
        actor: { userId: "exec-1", fullName: "E", roles: ["EXECUTIVE"] },
        noteId: "n-1",
        now: NOW,
      },
    );
    expect(result).toEqual({ ok: false, error: PERMISSION_DENIED_MESSAGE, denied: true });
    expect(await noteRepo.listForSubject("CUS-2042")).toEqual([]);
  });

  it("13. enforcement lives in the orchestrators — bypassing the UI cannot bypass authorization", async () => {
    // The orchestrators above ARE what the server actions execute; there is no
    // alternate mutation path. A directly-invoked action with a denied role
    // reaches the same guard (proved by 7–12); here we additionally pin that
    // a PERMITTED actor on the same inputs succeeds — i.e. the guard, not the
    // input shape, is what denied them.
    const noteRepo = new MockNoteRepository();
    const result = await executeAddNote(
      { noteRepo },
      {
        subjectId: "CUS-2042",
        body: "persists for a permitted role",
        actor: { userId: "cs-1", fullName: "S", roles: ["CUSTOMER_SUPPORT"] },
        noteId: "n-2",
        now: NOW,
      },
    );
    expect(result.ok).toBe(true);
    expect(await noteRepo.listForSubject("CUS-2042")).toHaveLength(1);
  });
});

// ── Wiring guard (mandated 15) ────────────────────────────────────────────────

describe("mutating-action wiring guard", () => {
  it("15. every 'use server' action file routes mutations through an authorization decision", () => {
    // Source-level pin: each server-action module must reference the
    // authorization seam (an execute* orchestrator that enforces, or
    // ensurePermission directly). A future mutating action added without an
    // authorization decision fails this test.
    const actionFiles = [
      "lib/work/server-actions.ts",
      "lib/practitioners/server-actions.ts",
      "lib/customers/support-actions.ts",
      "lib/customers/contact-actions.ts",
      "lib/customers/device-actions.ts",
    ];
    const root = process.cwd();
    for (const file of actionFiles) {
      const src = readFileSync(join(root, file), "utf8");
      expect(
        /execute[A-Z]\w*\(/.test(src) || src.includes("ensurePermission"),
        `${file} must route through an enforcing orchestrator`,
      ).toBe(true);
      expect(src, `${file} must report authz denials`).toContain("reportAuthzDenial");
    }
    // And no OTHER "use server" files exist that we aren't guarding.
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (["node_modules", ".next", "dist"].includes(entry.name)) continue;
          walk(join(dir, entry.name));
        } else if (/\.tsx?$/.test(entry.name)) {
          const path = join(dir, entry.name);
          const src = readFileSync(join(root, path), "utf8");
          if (src.startsWith('"use server"')) found.push(path.replace(/\\/g, "/"));
        }
      }
    };
    walk("lib");
    walk("app");
    expect(found.sort()).toEqual(
      [
        "lib/auth/actions.ts", // session establishment — pre-authorization by nature
        "lib/customers/contact-actions.ts",
        "lib/customers/device-actions.ts",
        "lib/customers/support-actions.ts",
        "lib/practitioners/server-actions.ts",
        "lib/work/server-actions.ts",
      ].sort(),
    );
  });
});
