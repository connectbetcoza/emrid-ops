"use server";

import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { CognitoError, initiateAuth, revokeToken } from "@/lib/auth/cognito";
import {
  clearSessionCookies,
  readRefreshToken,
  writeSessionCookies,
} from "@/lib/auth/cookies";
import { LOGIN_PATH } from "@/lib/auth/constants";
import {
  missingCredentialsMessage,
  safeNextPath,
  signInErrorMessage,
} from "@/lib/auth/login-core";

/**
 * Auth server actions for EMRID Operations staff — the single server-side entry
 * points for establishing and tearing down a session. Credential-free Cognito
 * (public app client) end to end: the password transits over TLS to this server
 * action and never reaches JS-readable storage; tokens live only in httpOnly
 * cookies (`writeSessionCookies`). All branching logic (open-redirect guard,
 * error mapping) lives in the pure `login-core`; these wrappers stay thin
 * (Engineering Rule 15) and fail closed.
 */

export type SignInState = { error: string | null };

/**
 * Sign in with email + password (for `useActionState`). On success, sets the
 * session cookies and redirects to the validated `next` path (or the default
 * authenticated path). On failure, returns a calm, non-leaky message — the form
 * re-renders with it. `redirect()` throws to perform the navigation, so it runs
 * AFTER the try/catch (never swallowed as an error).
 */
export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const missing = missingCredentialsMessage(email, password);
  if (missing) return { error: missing };

  try {
    const tokens = await initiateAuth(email.trim(), password);
    await writeSessionCookies(tokens);
  } catch (error) {
    const code = error instanceof CognitoError ? error.code : "UnknownError";
    return { error: signInErrorMessage(code) };
  }

  redirect(next);
}

/**
 * Sign out: best-effort revoke of the refresh token (so it can't be replayed),
 * then clear the session cookies and return to the login route. In mock mode
 * there is no Cognito session — clearing cookies is harmless and the login page
 * immediately re-resolves the demo user, preserving mock behaviour; the UI does
 * not expose this action in mock mode.
 */
export async function signOut(): Promise<void> {
  if (!config.useMockAuth) {
    const refresh = await readRefreshToken();
    if (refresh) {
      try {
        await revokeToken(refresh);
      } catch {
        // Best-effort: a failed revoke must never block local sign-out.
      }
    }
  }
  await clearSessionCookies();
  redirect(LOGIN_PATH);
}
