"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth/actions";

/** Initials from a full name, e.g. "Michael Edwards" → "ME". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Header account control: avatar + name + role, opening a small menu. In
 * Cognito mode "Sign out" posts to the `signOut` server action (revoke + clear
 * cookies + redirect to /login). In mock mode there is no real session to end,
 * so it stays an honest disabled affordance labelled "Mock".
 */
export function UserMenu({
  name,
  email,
  roleLabel,
}: {
  name: string;
  email: string;
  roleLabel: string;
}) {
  const { mockMode } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md p-1 pr-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
          {initials(name)}
        </span>
        <span className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <ChevronsUpDown
          className="hidden h-4 w-4 text-muted-foreground lg:block"
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 origin-top-right animate-scale-in rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">
              {name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
            <p className="mt-1 text-xs font-medium text-primary">{roleLabel}</p>
          </div>
          {mockMode ? (
            <button
              type="button"
              role="menuitem"
              disabled
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
              <span className="ml-auto text-[0.6875rem] uppercase tracking-wide">
                Mock
              </span>
            </button>
          ) : (
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
