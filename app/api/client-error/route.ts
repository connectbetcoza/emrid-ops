import { NextResponse, type NextRequest } from "next/server";
import { reportError } from "@/lib/observability/report";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

/**
 * Client-error ingestion (GH-1). Receives the small beacon from the client
 * error boundaries and re-emits it through the server reporting seam (→
 * CloudWatch). The Edge middleware's cookie-presence gate applies to this
 * route, so only signed-in staff browsers can post. Payload is size-capped and
 * field-whitelisted; it is telemetry, never trusted data.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" ? v.slice(0, max) : undefined;

  reportError(new Error(str(payload.message, 300) ?? "client error"), {
    scope: "client",
    digest: str(payload.digest, 100),
    extra: {
      clientName: str(payload.name, 100),
      path: str(payload.path, 200),
    },
  });
  return NextResponse.json({ ok: true });
}
