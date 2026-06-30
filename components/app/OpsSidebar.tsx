"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OpsLogo } from "@/components/brand/OpsLogo";
import { OPS_NAV, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Persistent primary navigation. Renders {@link OPS_NAV} as grouped link
 * blocks separated by dividers, with quiet section labels. Visible on tablet
 * and up (the platform is desktop/tablet only — no mobile nav by design).
 */
export function OpsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center border-b border-border px-5">
        <OpsLogo />
      </div>
      <nav
        aria-label="Primary"
        className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
      >
        {OPS_NAV.map((group, idx) => (
          <div key={group.id} className="space-y-1">
            {group.label ? (
              <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                {group.label}
              </p>
            ) : null}
            {idx > 0 && !group.label ? (
              <div className="mx-3 mb-2 border-t border-border" aria-hidden />
            ) : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-muted text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-border px-5 py-3">
        <p className="text-[0.6875rem] text-muted-foreground">
          EMRID Operations · v0.1
        </p>
      </div>
    </aside>
  );
}
