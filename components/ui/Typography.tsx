import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Typographic scale for EMRID Operations. Centralising these keeps headings and
 * body copy consistent across every page and panel. The scale is deliberately
 * tight and quiet — weight and colour carry hierarchy more than size, in the
 * Linear/Notion idiom.
 *
 *   PageTitle    → 24px / semibold   one per page
 *   SectionTitle → 16px / semibold   section + card headings
 *   Eyebrow      → 12px / uppercase  small label above a title
 *   Lead         → 15px / muted      supporting line under a title
 *   Text         → 14px              default body
 *   Muted        → 14px / muted      secondary body
 */
export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "text-2xl font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-base font-semibold tracking-tight text-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Lead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-[0.9375rem] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function Text({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-foreground", className)}>{children}</p>;
}

export function Muted({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>
  );
}
