import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export type MetricTrend = {
  /** e.g. "+12%" or "3 today" — already formatted by the caller. */
  label: string;
  direction: "up" | "down" | "flat";
  /** Whether an "up" trend is good (green) or bad (red). Defaults to good-up. */
  intent?: "positive" | "negative";
};

/**
 * A single headline number with an optional label, icon, and trend indicator.
 * The atomic unit of dashboards and summary panels. Data is supplied by the
 * caller — the card carries no business logic.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: MetricTrend;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight text-card-foreground">
          {value}
        </span>
        {trend ? <TrendPill trend={trend} /> : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function TrendPill({ trend }: { trend: MetricTrend }) {
  const positive =
    trend.intent === "negative"
      ? trend.direction === "down"
      : trend.direction === "up";
  const Icon =
    trend.direction === "down"
      ? ArrowDownRight
      : trend.direction === "up"
        ? ArrowUpRight
        : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        trend.direction === "flat"
          ? "text-muted-foreground"
          : positive
            ? "text-success"
            : "text-danger",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {trend.label}
    </span>
  );
}
