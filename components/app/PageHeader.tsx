import type { ReactNode } from "react";
import { PageTitle, Lead } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

/**
 * Standard page heading: title + optional description, with an actions slot on
 * the right. Every workspace and section page uses this so headings stay
 * consistent across the platform.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <PageTitle>{title}</PageTitle>
        {description ? <Lead>{description}</Lead> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
