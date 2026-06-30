import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Keyboard shortcut hint, e.g. ⌘ K. Renders as a small key cap. */
export function Kbd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[0.6875rem] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
