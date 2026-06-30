import { Card, CardTitle } from "@/components/ui/Card";
import {
  CircularProgress,
  LinearProgress,
} from "@/components/ui/ProgressIndicator";
import { runHealthEngine } from "@/lib/engines/health";

/**
 * "Operational Health" widget — the headline health score plus a breakdown of
 * the SLAs and signals that compose it, fed by the Health Engine. Mock only.
 */
export function OperationalHealth() {
  const { score, metrics } = runHealthEngine();
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <CardTitle>Operational health</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Rolling 24-hour score
          </p>
        </div>
        <CircularProgress
          value={score}
          size={72}
          strokeWidth={7}
          label={`Operational health ${score}%`}
        />
      </div>
      <dl className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{metric.label}</dt>
              <dd className="font-medium text-foreground">{metric.value}%</dd>
            </div>
            <LinearProgress
              value={metric.value}
              tone={metric.tone}
              label={metric.label}
            />
          </div>
        ))}
      </dl>
    </Card>
  );
}
