import { NextResponse, type NextRequest } from "next/server";
import { config as appConfig } from "@/lib/config";
import { ID_TOKEN_COOKIE, LOGIN_PATH } from "@/lib/auth/constants";

/**
 * Edge route protection (cheap, fail-closed).
 *
 * In Cognito mode this does a presence check for the session cookie and bounces
 * unauthenticated requests to login. The AUTHORITATIVE check is the server-side
 * crypto verification in `requireOpsUser()` — this is only a fast first gate.
 *
 * In mock mode (local dev) it is inert, so the shell stays usable offline. Like
 * the Patient Platform's middleware it fails closed: it never *disables* gating
 * based on a missing/garbled flag — it only adds gating when not in mock mode.
 */
export function middleware(request: NextRequest) {
  if (appConfig.useMockAuth) return NextResponse.next();

  const hasToken = request.cookies.has(ID_TOKEN_COOKIE);
  if (hasToken) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except Next internals, static assets, the login route
  // (must remain reachable while unauthenticated), and the health endpoint
  // (secret-free booleans by contract; uptime monitors need a 200, not a
  // redirect). /api/client-error deliberately STAYS behind the cookie gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/health).*)"],
};
