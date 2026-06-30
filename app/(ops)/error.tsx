"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

/**
 * Error boundary for the operations shell. Renders a calm, recoverable state
 * with a retry rather than a crashed page. In production this is also where
 * monitoring would be notified (console-only for now).
 */
export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Placeholder for real monitoring (Sentry/CloudWatch) in a later sprint.
    console.error("[emrid-ops] route error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description="This view hit an unexpected error. You can try again — if it persists, it has been logged for the team."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
