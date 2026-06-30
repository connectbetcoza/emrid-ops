import { SearchTrigger } from "@/components/app/SearchTrigger";
import { SessionBadge } from "@/components/app/SessionBadge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserMenu } from "@/components/app/UserMenu";

/**
 * Persistent application header: universal search (centre), theme toggle, and
 * the account menu. Stateless and presentational — identity is passed in by the
 * shell layout so this stays a plain server-rendered bar around the client
 * islands (search trigger, theme toggle, user menu).
 */
export function OpsHeader({
  name,
  email,
  roleLabel,
}: {
  name: string;
  email: string;
  roleLabel: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
      <div className="flex w-full max-w-md flex-1 items-center md:ml-0">
        <SearchTrigger />
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <SessionBadge />
        <ThemeToggle />
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <UserMenu name={name} email={email} roleLabel={roleLabel} />
      </div>
    </header>
  );
}
