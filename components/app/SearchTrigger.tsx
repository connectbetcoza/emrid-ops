"use client";

import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/Kbd";
import { useCommandPalette } from "@/components/command/CommandPaletteProvider";
import { cn } from "@/lib/utils";

/**
 * The header's universal-search affordance. Opens the command palette (also
 * reachable via ⌘K / Ctrl K) and shows the shortcut hint.
 */
export function SearchTrigger({ className }: { className?: string }) {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search EMRID Operations"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "group flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left">Search or jump to…</span>
      <span className="hidden items-center gap-0.5 sm:flex">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
