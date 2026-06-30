import { Check, Circle } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { CircularProgress } from "@/components/ui/ProgressIndicator";
import { ReadinessBadge } from "@/components/readiness/ReadinessBadge";
import { readinessBandMeta, type ReadinessResult } from "@/lib/readiness/core";
import { cn } from "@/lib/utils";

const RING_TONE = {
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

/**
 * Full Readiness breakdown — score ring, band, and the factor checklist showing
 * exactly what is done and what remains. The Customer Workspace's Readiness
 * Card; also usable anywhere a customer's full readiness picture is needed.
 */
export function ReadinessCard({ result }: { result: ReadinessResult }) {
  const meta = readinessBandMeta(result.band);
  const tone = (meta.tone === "success" || meta.tone === "warning" || meta.tone === "danger"
    ? meta.tone
    : "success") as "success" | "warning" | "danger";

  return (
    <Card className="space-y-4">
      <CardTitle>Readiness</CardTitle>
      <div className="flex items-center gap-4">
        <CircularProgress
          value={result.score}
          tone={RING_TONE[tone]}
          size={72}
          strokeWidth={7}
          label={`Readiness ${result.score}%`}
        />
        <div className="space-y-1.5">
          <ReadinessBadge band={result.band} />
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>
      <ul className="space-y-2 border-t border-border pt-3">
        {result.factors.map((factor) => (
          <li key={factor.key} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                factor.met
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {factor.met ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : (
                <Circle className="h-2 w-2" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                "flex-1",
                factor.met ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {factor.label}
            </span>
            <span className="sr-only">{factor.met ? "complete" : "outstanding"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
