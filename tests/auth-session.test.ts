import { describe, it, expect } from "vitest";
import {
  isActiveOpsUser,
  resolveOpsSession,
  postLoginRedirect,
  rolesFromGroups,
  opsUserFromIdToken,
} from "@/lib/auth/session";
import type { OpsUser, OpsUserStatus } from "@/types";

function opsUser(status: OpsUserStatus = "ACTIVE"): OpsUser {
  return {
    userId: "u1",
    email: "officer@emrid.co.za",
    fullName: "Test Officer",
    roles: ["IDENTITY_OFFICER"],
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("isActiveOpsUser", () => {
  it("is true only for an ACTIVE user", () => {
    expect(isActiveOpsUser(opsUser("ACTIVE"))).toBe(true);
    expect(isActiveOpsUser(opsUser("SUSPENDED"))).toBe(false);
    expect(isActiveOpsUser(opsUser("DISABLED"))).toBe(false);
    expect(isActiveOpsUser(null)).toBe(false);
    expect(isActiveOpsUser(undefined)).toBe(false);
  });
});

describe("resolveOpsSession", () => {
  const mockUser = opsUser();
  const verifiedUser = { ...opsUser(), userId: "real", email: "real@emrid.co.za" };

  it("uses the mock user in mock mode", () => {
    expect(
      resolveOpsSession({ mockMode: true, mockUser, verifiedUser: null }),
    ).toBe(mockUser);
  });

  it("uses the verified user outside mock mode", () => {
    expect(
      resolveOpsSession({ mockMode: false, mockUser, verifiedUser }),
    ).toBe(verifiedUser);
  });

  it("fails closed to null when no verified user outside mock mode", () => {
    expect(
      resolveOpsSession({ mockMode: false, mockUser, verifiedUser: null }),
    ).toBeNull();
  });

  it("fails closed when the resolved candidate is not ACTIVE", () => {
    const suspended = opsUser("SUSPENDED");
    expect(
      resolveOpsSession({
        mockMode: true,
        mockUser: suspended,
        verifiedUser: null,
      }),
    ).toBeNull();
  });
});

describe("rolesFromGroups", () => {
  it("keeps valid OpsRoles and drops unknown groups", () => {
    expect(
      rolesFromGroups(["OPERATIONS_ADMIN", "not-a-role", "IDENTITY_OFFICER"]),
    ).toEqual(["OPERATIONS_ADMIN", "IDENTITY_OFFICER"]);
    expect(rolesFromGroups([])).toEqual([]);
  });
});

describe("opsUserFromIdToken", () => {
  it("maps Cognito claims to an OpsUser (userId === sub, roles from groups)", () => {
    const user = opsUserFromIdToken({
      sub: "cog-123",
      email: "naledi@emrid.co.za",
      name: "Naledi Khumalo",
      groups: ["IDENTITY_OFFICER", "bogus"],
      iat: 1_700_000_000,
    });
    expect(user.userId).toBe("cog-123");
    expect(user.cognitoSub).toBe("cog-123");
    expect(user.fullName).toBe("Naledi Khumalo");
    expect(user.roles).toEqual(["IDENTITY_OFFICER"]);
    expect(user.status).toBe("ACTIVE");
  });

  it("falls back to the email local-part when no name claim", () => {
    const user = opsUserFromIdToken({ sub: "s", email: "ops@emrid.co.za", groups: [] });
    expect(user.fullName).toBe("ops");
  });
});

describe("postLoginRedirect", () => {
  it("active user → mission control", () => {
    expect(postLoginRedirect(opsUser("ACTIVE"))).toBe("/mission-control");
  });

  it("missing or inactive user → login", () => {
    expect(postLoginRedirect(null)).toBe("/login");
    expect(postLoginRedirect(opsUser("DISABLED"))).toBe("/login");
  });
});

// ── Finding 1: pool membership is NOT staff membership (fail-closed gate) ─────
// The Cognito pool is shared with the Patient Platform, so patients and
// practitioners hold valid pool credentials. Only a token carrying at least one
// valid Ops role group may ever resolve to an Operations session.

import { isAuthorizedOpsUser } from "@/lib/auth/session";

describe("Ops staff gate (isAuthorizedOpsUser + resolveOpsSession)", () => {
  const resolve = (verifiedUser: OpsUser | null) =>
    resolveOpsSession({ mockMode: false, mockUser: null, verifiedUser });

  it("1. verified token with NO groups → rejected (null session)", () => {
    const user = opsUserFromIdToken({
      sub: "patient-sub",
      email: "patient@example.com",
      groups: [],
    });
    expect(user.roles).toEqual([]);
    expect(isAuthorizedOpsUser(user)).toBe(false);
    expect(resolve(user)).toBeNull();
  });

  it("2. verified token with UNKNOWN groups only → rejected (null session)", () => {
    const user = opsUserFromIdToken({
      sub: "someone",
      email: "someone@example.com",
      groups: ["patients", "beta-testers", "ADMIN"], // none are OpsRoles
    });
    expect(user.roles).toEqual([]);
    expect(isAuthorizedOpsUser(user)).toBe(false);
    expect(resolve(user)).toBeNull();
  });

  it("3. verified token with a valid Ops group → accepted", () => {
    const user = opsUserFromIdToken({
      sub: "staff-sub",
      email: "officer@emrid.co.za",
      groups: ["IDENTITY_OFFICER"],
    });
    expect(isAuthorizedOpsUser(user)).toBe(true);
    expect(resolve(user)).toEqual(user);
    // A mix of unknown + valid groups is also staff.
    const mixed = opsUserFromIdToken({
      sub: "staff-2",
      email: "admin@emrid.co.za",
      groups: ["unknown-group", "OPERATIONS_ADMIN"],
    });
    expect(resolve(mixed)).toEqual(mixed);
  });

  it("4. a practitioner-style pool user (no Ops group) can never access Ops", () => {
    // Shaped like Dr Michael Edwards' provisioned login: real pool account,
    // name + email claims, zero Cognito groups.
    const dr = opsUserFromIdToken({
      sub: "32358424-0000-0000-0000-000000000000",
      email: "dr@edwardsfp.co.za",
      name: "Dr Michael Edwards",
      groups: [],
    });
    expect(isAuthorizedOpsUser(dr)).toBe(false);
    expect(resolve(dr)).toBeNull();
    expect(postLoginRedirect(dr)).toBe("/login");
  });

  it("an ACTIVE user without roles is active but NOT authorized (gate is additive)", () => {
    const roleless: OpsUser = { ...opsUser(), roles: [] };
    expect(isActiveOpsUser(roleless)).toBe(true);
    expect(isAuthorizedOpsUser(roleless)).toBe(false);
    expect(resolve(roleless)).toBeNull();
  });
});
