import Link from "next/link";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EMRID Operations wordmark. Shares the EMRID DNA with the Patient Platform
 * but is visually its own product: an indigo glyph tile + an "Operations"
 * sublabel. Links to the dashboard unless given another href.
 */
export function OpsLogo({
  className,
  href = "/mission-control",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="EMRID Operations — Mission Control"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Activity className="h-[1.125rem] w-[1.125rem]" aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          EMRID
        </span>
        <span className="text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Operations
        </span>
      </span>
    </Link>
  );
}
