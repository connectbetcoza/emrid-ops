import { Card, CardTitle } from "@/components/ui/Card";
import { getAllCustomerStates } from "@/lib/customers/state";
import { readinessDistribution, readinessTotal } from "@/lib/customers/queries";
import {
  READINESS_BANDS,
  readinessBandMeta,
} from "@/lib/readiness/core";
import { cn } from "@/lib/utils";

const SEG = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted",
  primary: "bg-primary",
  info: "bg-info",
} as const;

/**
 * Readiness distribution across the customer base — a single stacked bar plus a
 * legend with counts. Built on the reusable Readiness domain; mock data only.
 */
export async function ReadinessDistribution() {
  const dist = readinessDistribution(await getAllCustomerStates());
  const total = readinessTotal(dist);

  return (
    <Card className="space-y-4">
      <CardTitle>Readiness across customers</CardTitle>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {READINESS_BANDS.map((band) => {
          const count = dist[band];
          if (count === 0) return null;
          const meta = readinessBandMeta(band);
          return (
            <div
              key={band}
              className={cn(SEG[meta.tone])}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${meta.label}: ${count}`}
            />
          );
        })}
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {READINESS_BANDS.map((band) => {
          const meta = readinessBandMeta(band);
          return (
            <div key={band} className="space-y-0.5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", SEG[meta.tone])} aria-hidden />
                {meta.label}
              </dt>
              <dd className="text-lg font-semibold tabular-nums text-foreground">
                {dist[band]}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}
