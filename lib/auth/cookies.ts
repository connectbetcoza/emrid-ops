import "server-only";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth/constants";

/**
 * httpOnly session cookies for Ops staff. Tokens live ONLY here — never in
 * JS-readable storage. `Secure` in production, `SameSite=Lax`, `path=/`.
 * Mirrors the Patient Platform's cookie handling.
 */
const baseOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  path: "/",
};

export async function readIdToken(): Promise<string | undefined> {
  return (await cookies()).get(ID_TOKEN_COOKIE)?.value;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;
}

export async function writeSessionCookies(tokens: {
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}): Promise<void> {
  const store = await cookies();
  store.set(ID_TOKEN_COOKIE, tokens.idToken, {
    ...baseOptions,
    maxAge: tokens.expiresIn,
  });
  if (tokens.refreshToken) {
    store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...baseOptions,
      maxAge: 30 * 24 * 60 * 60,
    });
  }
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ID_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}
