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
