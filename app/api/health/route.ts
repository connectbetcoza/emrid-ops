import { NextResponse } from "next/server";
import { config, isCognitoConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Health endpoint (GH-5) — secret-free liveness + resolved-adapter check for
 * uptime monitors and the operator's deploy-verification step. Mirrors the
 * `[emrid-ops] resolved config` boot diagnostic: booleans only, never names,
 * ids, or env values. Excluded from the auth middleware so monitors get a 200,
 * not a login redirect.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    app: "emrid-ops",
    appEnv: config.appEnv,
    mock: {
      auth: config.useMockAuth,
      data: config.useMockData,
      uploads: config.useMockUploads,
    },
    cognitoConfigured: isCognitoConfigured(),
    at: new Date().toISOString(),
  });
}
