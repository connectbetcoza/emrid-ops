import { OpsSidebar } from "@/components/app/OpsSidebar";
import { OpsHeader } from "@/components/app/OpsHeader";
import { CommandPaletteProvider } from "@/components/command/CommandPaletteProvider";
import { ToastProvider } from "@/components/feedback/ToastProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { requireOpsUser } from "@/lib/auth/server";
import { roleLabel } from "@/lib/auth/roles";
import { config } from "@/lib/config";
import { getDirectoryRepository } from "@/lib/data";
import { customerCommands } from "@/lib/search/commands";
import { primaryRole } from "@/types";

/**
 * Authenticated Operations shell: persistent sidebar + header wrapping a
 * scrolling workspace.
 *
 * `requireOpsUser()` is the protected-route guard — it redirects to login when
 * there is no active session. In Sprint 1 (mock mode) it resolves the demo Ops
 * user; once Cognito is wired it enforces for free. The resolved session is
 * handed to the client `AuthProvider` so components read identity without ever
 * touching server-only flags or tokens.
 */
export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireOpsUser();
  const label = roleLabel(primaryRole(user));

  // Live customer search for the ⌘K palette — one directory Query, serialised
  // into command items (never a scan, never a fixture).
  const directory = await getDirectoryRepository().listCustomers();
  const liveCustomerCommands = customerCommands(directory);

  return (
    <AuthProvider initialUser={user} mockMode={config.useMockAuth}>
      <ToastProvider>
        <CommandPaletteProvider customerCommands={liveCustomerCommands}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-md focus:border focus:border-border focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-popover-foreground focus:shadow-lg"
          >
            Skip to content
          </a>
          <div className="flex min-h-screen bg-background">
            <OpsSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <OpsHeader
                name={user.fullName}
                email={user.email}
                roleLabel={label}
              />
              <main
                id="main-content"
                tabIndex={-1}
                className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8"
              >
                <div className="mx-auto w-full max-w-7xl animate-fade-in">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </CommandPaletteProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
