"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

/**
 * Root error boundary (GH-1) — catches failures in the root layout itself,
 * which the (ops) shell boundary can't. Must render its own <html>/<body>.
 * Deliberately unstyled-safe: no design-system imports that could themselves
 * be the failing code.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
          Something went wrong
        </h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          The application hit an unexpected error. It has been logged.
        </p>
        <button
          onClick={reset}
          style={{ padding: "0.5rem 1.25rem", borderRadius: "0.5rem", border: "1px solid #ccc", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
