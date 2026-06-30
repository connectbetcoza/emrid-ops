import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import type { WorkStatus } from "@/lib/work/status";
import type { Priority } from "@/lib/work/priority";
import { cn } from "@/lib/utils";

export type QueueCardField = { label: string; value: ReactNode };

/**
 * Presentational card for a single queue row. Generic across domains: a title,
 * a subtitle, optional status/priority chips, a row of label/value fields, and
 * a trailing slot. Selection + layout are owned by the <Queue> shell; this card
 * only renders content.
 */
export function QueueCard({
  title,
  subtitle,
  status,
  priority,
  fields,
  trailing,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: WorkStatus;
  priority?: Priority;
  fields?: QueueCardField[];
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-medium text-foreground">
          {title}
        </span>
        {priority ? <PriorityBadge priority={priority} /> : null}
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {subtitle ? (
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      {fields && fields.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-0.5">
          {fields.map((field, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="text-xs font-medium text-foreground">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {trailing ? <div className="pt-1">{trailing}</div> : null}
    </div>
  );
}
