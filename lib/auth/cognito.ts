import "server-only";
import { config } from "@/lib/config";

/**
 * Minimal server-side Cognito client for a PUBLIC app client (no secret), for
 * EMRID Operations *staff* auth. Calls the Cognito IdP JSON API directly via
 * `fetch` — unauthenticated for a public client, so NO SigV4, NO AWS keys, NO
 * client secret. Mirrors the Patient Platform's `lib/auth/cognito.ts`.
 */
export type CognitoTokens = {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};

export class CognitoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CognitoError";
  }
}

function endpoint(): string {
  const region = config.cognito.region;
  if (!region) throw new CognitoError("ConfigError", "Cognito region is not set.");
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

function clientId(): string {
  const id = config.cognito.clientId;
  if (!id) throw new CognitoError("ConfigError", "Cognito client id is not set.");
  return id;
}

async function call<T>(target: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const rawType = typeof json.__type === "string" ? json.__type : "UnknownError";
    const code = rawType.includes("#") ? rawType.split("#").pop()! : rawType;
    const message =
      typeof json.message === "string" ? json.message : "Authentication failed.";
    throw new CognitoError(code, message);
  }
  return json as T;
}

type InitiateAuthResponse = {
  ChallengeName?: string;
  AuthenticationResult?: {
    IdToken: string;
    AccessToken: string;
    RefreshToken?: string;
    ExpiresIn: number;
  };
};

export async function initiateAuth(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const data = await call<InitiateAuthResponse>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId(),
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });
  if (data.ChallengeName || !data.AuthenticationResult) {
    throw new CognitoError(
      "ChallengeNotSupported",
      "This account requires an additional step that isn't supported yet.",
    );
  }
  const r = data.AuthenticationResult;
  return {
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken,
    expiresIn: r.ExpiresIn,
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await call("ConfirmSignUp", {
    ClientId: clientId(),
    Username: email,
    ConfirmationCode: code,
  });
}

export async function forgotPassword(email: string): Promise<void> {
  await call("ForgotPassword", { ClientId: clientId(), Username: email });
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await call("ConfirmForgotPassword", {
    ClientId: clientId(),
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
}

/** Revoke a refresh token on sign-out (best-effort). */
export async function revokeToken(refreshToken: string): Promise<void> {
  await call("RevokeToken", { ClientId: clientId(), Token: refreshToken });
}
