import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Circle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";

export type TimelineEvent = {
  id: string;
  /** Pre-formatted, human-readable time (e.g. "2h ago", "29 Jun 14:02"). */
  time: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
};

/**
 * Vertical activity timeline for a record. Events are supplied pre-formatted
 * (no date logic here) and rendered as a connected rail. The audit/activity
 * feed plugs into this in a later sprint.
 */
export function TimelineArea({
  title = "Activity",
  events,
}: {
  title?: string;
  events: TimelineEvent[];
}) {
  if (events.length === 0) {
    return (
      <Card className="space-y-4">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-4">
      <CardTitle>{title}</CardTitle>
      <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[0.5625rem] before:top-2 before:w-px before:bg-border">
        {events.map((event) => {
          const Icon = event.icon ?? Circle;
          return (
            <li key={event.id} className="relative flex gap-3">
              <span className="z-10 mt-0.5 flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border">
                <Icon className="h-3 w-3" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {event.title}
                  </p>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {event.time}
                  </time>
                </div>
                {event.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
