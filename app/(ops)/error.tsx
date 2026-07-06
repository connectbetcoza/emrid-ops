"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { reportClientError } from "@/lib/observability/client";

/**
 * Error boundary for the operations shell. Renders a calm, recoverable state
 * with a retry rather than a crashed page, and beacons the error (digest +
 * message, no PII) to /api/client-error → the server reporting seam →
 * CloudWatch.
 */
export default function OpsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  useEffect(() => {
    reportClientError(error, pathname ?? "");
  }, [error, pathname]);

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
