import { DEFAULT_AUTHENTICATED_PATH } from "@/lib/auth/constants";

/**
 * Pure login-decision core. No Next/AWS imports, so it is fully unit-testable
 * (the established `*-core.ts` convention). The server action (`actions.ts`)
 * supplies the runtime inputs (the submitted `next`, the Cognito error code);
 * all the *logic* — the open-redirect guard and the error->message mapping —
 * lives here so it is verified without a browser or AWS.
 */

/**
 * Resolve a safe post-login destination from an untrusted `next` value (a query
 * param set by the middleware / a deep link). Fails closed to the default
 * authenticated path for anything that isn't an obviously-local in-app path.
 *
 * Rejected: missing/blank, arrays, non-strings, protocol-relative (`//host`),
 * backslash tricks (`/\host`), absolute URLs (`https://...`, `javascript:`), and
 * anything not beginning with a single `/`. This is the open-redirect guard:
 * the login flow must never bounce a user to an attacker-controlled origin.
 */
export function safeNextPath(
  next: string | string[] | undefined | null,
): string {
  if (typeof next !== "string") return DEFAULT_AUTHENTICATED_PATH;
  const value = next.trim();

  // Must be a single-slash-rooted in-app path.
  if (!value.startsWith("/")) return DEFAULT_AUTHENTICATED_PATH;
  // Protocol-relative ("//evil.com") or backslash-smuggled ("/\evil.com").
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  // Reject embedded control characters (CR/LF/NUL/DEL, etc.) that could smuggle
  // a header split or a second path. A scheme ("javascript:", "https:") is
  // already rejected by the leading-single-"/" rule above.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return DEFAULT_AUTHENTICATED_PATH;
  }
  // Never send an authenticated user back to the login route.
  if (value === "/login" || value.startsWith("/login?")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  return value;
}

/**
 * Map a Cognito IdP error code to a calm, honest, non-leaky sign-in message.
 * We deliberately collapse "user not found" and "wrong password" into one
 * message so the form never reveals which accounts exist. Unknown codes fall
 * back to a generic message rather than surfacing a raw AWS error string.
 */
export function signInErrorMessage(code: string): string {
  switch (code) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "UserNotConfirmedException":
      return "This account isn't confirmed yet. Contact an administrator.";
    case "PasswordResetRequiredException":
      return "A password reset is required. Contact an administrator.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many attempts. Please wait a moment and try again.";
    case "ChallengeNotSupported":
      return "This account requires an additional step that isn't supported yet.";
    case "ConfigError":
      return "Sign-in is temporarily unavailable. Please try again later.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

/**
 * Shown when valid pool credentials carry no Ops role group — a patient or
 * practitioner account signing in at the staff door. Honest by design: Cognito's
 * public client already confirms credential validity to anyone who asks it
 * directly, so collapsing this into "incorrect password" would mislead a
 * misconfigured staff member without denying an attacker anything.
 */
export const NO_OPS_ACCESS_MESSAGE =
  "This account doesn't have access to EMRID Operations. Contact an administrator.";

/**
 * Validate the submitted credentials are present. Returns a message when the
 * form is incomplete, else `null`. (Authentication itself is Cognito's job.)
 */
export function missingCredentialsMessage(
  email: string,
  password: string,
): string | null {
  if (!email.trim() || !password) {
    return "Enter your email and password.";
  }
  return null;
}
