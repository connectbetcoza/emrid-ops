import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OpsLogo } from "@/components/brand/OpsLogo";
import { Eyebrow, Lead, PageTitle } from "@/components/ui/Typography";
import { getCurrentOpsUser } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/login-core";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Operations staff sign-in. Lives OUTSIDE the `(ops)` route group so it is not
 * wrapped by the authenticated shell (whose `requireOpsUser()` would otherwise
 * redirect here and loop). The middleware excludes `/login` from gating too.
 *
 * If a session already resolves we skip the form and go straight to the
 * destination — in mock mode the demo user always resolves, so `/login`
 * forwards to Mission Control, preserving the "always signed in" mock
 * behaviour; in Cognito mode an already-authenticated user is forwarded as well.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const dest = safeNextPath(next);

  const user = await getCurrentOpsUser();
  if (user) redirect(dest);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in space-y-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <OpsLogo href="/login" />
          <div className="space-y-1.5">
            <Eyebrow>Operations</Eyebrow>
            <PageTitle>Sign in</PageTitle>
            <Lead>Staff access to the EMRID operating system.</Lead>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <LoginForm next={dest} />
        </div>
      </div>
    </main>
  );
}
