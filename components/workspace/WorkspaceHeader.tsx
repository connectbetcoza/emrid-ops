import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";

/**
 * The identity bar of a workspace: an eyebrow (entity type / id), the title,
 * inline status chips, and a primary-actions slot. Sits at the top of every
 * record workspace.
 */
export function WorkspaceHeader({
  eyebrow,
  title,
  badges,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {badges}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
