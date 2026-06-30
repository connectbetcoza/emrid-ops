import "server-only";
import { redirect } from "next/navigation";
import type { OpsUser } from "@/types";
import { config } from "@/lib/config";
import { getMockOpsUser } from "@/lib/auth/mock-user";
import { opsUserFromIdToken, resolveOpsSession } from "@/lib/auth/session";
import { readIdToken } from "@/lib/auth/cookies";
import { verifyIdToken } from "@/lib/auth/verifier";
import { LOGIN_PATH } from "@/lib/auth/constants";

/**
 * Credential-free Cognito verification (mirrors the Patient Platform): read the
 * httpOnly ID token, verify it against the User Pool JWKS, map claims → OpsUser.
 * Returns null when absent/invalid so `requireOpsUser` fails closed.
 */
async function verifiedOpsUser(): Promise<OpsUser | null> {
  const token = await readIdToken();
  if (!token) return null;
  const payload = await verifyIdToken(token);
  if (!payload) return null;
  return opsUserFromIdToken(payload);
}

/**
 * Resolve the current Ops user. In mock mode we return the demo user WITHOUT
 * touching cookies — so mock pages stay statically renderable (the default
 * build) and the shell is usable offline. Only the real Cognito path reads the
 * request cookie (which correctly makes those routes dynamic per-request).
 */
export async function getCurrentOpsUser(): Promise<OpsUser | null> {
  if (config.useMockAuth) {
    return resolveOpsSession({
      mockMode: true,
      mockUser: getMockOpsUser(),
      verifiedUser: null,
    });
  }
  return resolveOpsSession({
    mockMode: false,
    mockUser: null,
    verifiedUser: await verifiedOpsUser(),
  });
}

/**
 * Protected-route guard. Returns the active Ops user or redirects to login.
 * Use at the top of the authenticated shell layout and any server component
 * that must not render for an unauthenticated request.
 */
export async function requireOpsUser(): Promise<OpsUser> {
  const user = await getCurrentOpsUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}
