import type { OpsRole, OpsUser } from "@/types";
import { OPS_ROLES } from "@/lib/auth/roles";
import { DEFAULT_AUTHENTICATED_PATH, LOGIN_PATH } from "@/lib/auth/constants";

/**
 * Pure session-decision core. No Next/AWS imports, so it is fully unit-testable
 * (the established `session.ts` / `server.ts` split). The server wrapper
 * (`server.ts`) supplies the runtime inputs; all the *logic* lives here.
 */

/** Only ACTIVE users hold a usable session. SUSPENDED/DISABLED fail closed. */
export function isActiveOpsUser(user: OpsUser | null | undefined): boolean {
  return Boolean(user && user.status === "ACTIVE");
}

/**
 * Resolve the effective session user from the adapter inputs.
 *
 *   mockMode → the demo Ops user (local dev / non-production).
 *   otherwise → the Cognito-verified user, if any (wired in a later sprint).
 *
 * Fail closed: a non-active user resolves to `null`. This is the single place
 * the "who is signed in" decision is made.
 */
export function resolveOpsSession(input: {
  mockMode: boolean;
  mockUser: OpsUser | null;
  verifiedUser: OpsUser | null;
}): OpsUser | null {
  const candidate = input.mockMode ? input.mockUser : input.verifiedUser;
  return isActiveOpsUser(candidate) ? candidate : null;
}

/** Map Cognito `cognito:groups` to valid OpsRoles (operator names groups exactly). */
export function rolesFromGroups(groups: string[]): OpsRole[] {
  const valid = new Set<string>(OPS_ROLES);
  return groups.filter((g): g is OpsRole => valid.has(g));
}

/**
 * Map verified Cognito ID-token claims to an Ops staff `OpsUser`. Pure. The
 * identity key decision matches the Patient Platform: `userId === Cognito sub`.
 * Roles come from `cognito:groups`; status is ACTIVE for a verified token.
 */
export function opsUserFromIdToken(payload: {
  sub: string;
  email?: string;
  name?: string;
  groups: string[];
  iat?: number;
}): OpsUser {
  const issuedAt = payload.iat ? new Date(payload.iat * 1000).toISOString() : "";
  const email = payload.email ?? "";
  return {
    userId: payload.sub,
    cognitoSub: payload.sub,
    email,
    fullName: payload.name ?? (email ? email.split("@")[0]! : "Operations User"),
    roles: rolesFromGroups(payload.groups),
    status: "ACTIVE",
    createdAt: issuedAt,
    updatedAt: issuedAt,
  };
}

/**
 * Where to send a user after a successful login (or when they hit `/`).
 * Active user → the dashboard; otherwise back to login. Returns only a path —
 * never the user's status — so nothing sensitive crosses to the client.
 */
export function postLoginRedirect(user: OpsUser | null): string {
  return isActiveOpsUser(user) ? DEFAULT_AUTHENTICATED_PATH : LOGIN_PATH;
}
