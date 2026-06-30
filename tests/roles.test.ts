import { describe, it, expect } from "vitest";
import { ROLE_META, OPS_ROLES, roleLabel, roleMeta } from "@/lib/auth/roles";
import type { OpsRole } from "@/types";

const EXPECTED_ROLES: OpsRole[] = [
  "SUPER_ADMIN",
  "OPERATIONS_ADMIN",
  "CUSTOMER_SUPPORT",
  "IDENTITY_OFFICER",
  "FULFILMENT_OFFICER",
  "PRACTITIONER_MANAGER",
  "EXECUTIVE",
];

describe("ROLE_META", () => {
  it("covers exactly the seven Operations roles", () => {
    expect(Object.keys(ROLE_META).sort()).toEqual([...EXPECTED_ROLES].sort());
    expect([...OPS_ROLES].sort()).toEqual([...EXPECTED_ROLES].sort());
  });

  it("every role has a non-empty label and description", () => {
    for (const role of OPS_ROLES) {
      const meta = roleMeta(role);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });

  it("carries identity metadata only — no permission/capability fields", () => {
    // Sprint 1 models identity, not authorization. Guard against a permissions
    // field sneaking in before the dedicated permissions sprint.
    for (const role of OPS_ROLES) {
      expect(Object.keys(roleMeta(role)).sort()).toEqual([
        "description",
        "label",
      ]);
    }
  });

  it("roleLabel resolves a role and falls back when none", () => {
    expect(roleLabel("OPERATIONS_ADMIN")).toBe("Operations Administrator");
    expect(roleLabel(null)).toBe("Operations");
  });
});
