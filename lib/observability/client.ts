"use client";

/**
 * Client-side error beacon (GH-1). Browser errors can't reach CloudWatch, so
 * error boundaries post a SMALL, PII-free payload to /api/client-error, which
 * logs it through the server reporting seam. Fire-and-forget (`keepalive`), and
 * never throws — a failed beacon must never worsen the error state.
 */
export function reportClientError(
  error: Error & { digest?: string },
  path: string,
): void {
  try {
    const payload = JSON.stringify({
      digest: error.digest,
      name: error.name,
      message: String(error.message ?? "").slice(0, 300),
      path: path.slice(0, 200),
    });
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never cascade.
  }
}
