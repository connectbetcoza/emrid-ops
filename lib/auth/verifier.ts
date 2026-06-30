import "server-only";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "@/lib/config";

/**
 * Verified ID-token claims for an Operations staff user. `cognito:groups` carry
 * the staff's role assignments (mapped to `OpsRole` in the session core).
 */
export type OpsIdTokenPayload = {
  sub: string;
  email?: string;
  name?: string;
  groups: string[];
  iat?: number;
};

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!config.cognito.userPoolId || !config.cognito.clientId) {
    throw new Error("Cognito user pool / client id are not configured.");
  }
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.cognito.userPoolId,
      tokenUse: "id",
      clientId: config.cognito.clientId,
    });
  }
  return verifier;
}

/** Verify the Cognito ID token; returns null on any failure (treated as no session). */
export async function verifyIdToken(
  token: string,
): Promise<OpsIdTokenPayload | null> {
  try {
    const verified = await getVerifier().verify(token);
    const p = verified as Record<string, unknown>;
    const rawGroups = p["cognito:groups"];
    const groups = Array.isArray(rawGroups) ? rawGroups.map(String) : [];
    return {
      sub: String(p.sub),
      email: typeof p.email === "string" ? p.email : undefined,
      name: typeof p.name === "string" ? p.name : undefined,
      groups,
      iat: typeof p.iat === "number" ? p.iat : undefined,
    };
  } catch (error) {
    // Never log the token; log a safe diagnostic only.
    console.warn("[emrid-ops] ID token verification failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
