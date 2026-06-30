"use client";

import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Surfaces the adapter mode for the current session. Shows a "Mock session"
 * pill while running on the mock auth adapter (local dev / non-production), so
 * it is always obvious the identity is not a real Cognito sign-in. Renders
 * nothing once real auth is active.
 */
export function SessionBadge() {
  const { mockMode } = useAuth();
  if (!mockMode) return null;
  return (
    <Badge tone="warning" className="hidden md:inline-flex">
      <FlaskConical className="h-3 w-3" aria-hidden />
      Mock session
    </Badge>
  );
}
