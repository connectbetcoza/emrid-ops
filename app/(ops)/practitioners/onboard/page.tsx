import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/Card";
import { OnboardForm } from "@/components/practitioners/OnboardForm";
import { requireOpsUser } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldX } from "lucide-react";

export const metadata: Metadata = { title: "Onboard practitioner" };

/**
 * Internal practitioner onboarding — V1: Administration owns creation; the
 * account is ACTIVE immediately; Cognito credentials remain a manual step
 * unless an existing Cognito user id is linked in the form.
 */
export default async function OnboardPractitionerPage() {
  const user = await requireOpsUser();
  if (!hasPermission(user, "MANAGE_PRACTITIONERS")) {
    // Direct navigation fails closed — calm, read-only denial.
    return (
      <div className="mx-auto max-w-lg py-12">
        <EmptyState
          icon={ShieldX}
          title="Practitioner management requires permission"
          description="Your role can't onboard practitioners. Contact an administrator if you need access."
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link
        href="/practitioners"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Practitioners
      </Link>
      <PageHeader
        title="Onboard practitioner"
        description="Create the practitioner and practice records. The account is active immediately; login credentials are set up manually in V1."
      />
      <Card>
        <OnboardForm />
      </Card>
    </div>
  );
}
