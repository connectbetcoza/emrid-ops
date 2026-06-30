import { AlertTriangle, Info, ShieldAlert, type LucideIcon } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { runAlertEngine } from "@/lib/engines/alerts";
import type { AlertSeverity } from "@/lib/engines/types";
import { cn } from "@/lib/utils";

const SEVERITY: Record<
  AlertSeverity,
  { tone: BadgeTone; icon: LucideIcon; label: string; text: string }
> = {
  critical: {
    tone: "danger",
    icon: ShieldAlert,
    label: "Critical",
    text: "text-danger",
  },
  warning: {
    tone: "warning",
    icon: AlertTriangle,
    label: "Warning",
    text: "text-warning",
  },
  info: { tone: "info", icon: Info, label: "Info", text: "text-info" },
};

/**
 * "Operational Alerts" widget — conditions that need operator attention,
 * ranked by severity. Mock data only; an alerting engine wires in later.
 */
export function OperationalAlerts() {
  const alerts = runAlertEngine();
  return (
    <Card className="space-y-4">
      <CardTitle>Operational alerts</CardTitle>
      <ul className="space-y-3">
        {alerts.map((alert) => {
          const meta = SEVERITY[alert.severity];
          const Icon = meta.icon;
          return (
            <li key={alert.id} className="flex gap-3">
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", meta.text)}
                aria-hidden
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {alert.title}
                  </p>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {alert.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
