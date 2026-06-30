import { Badge } from "@/components/ui/Badge";
import { statusMeta, type WorkStatus } from "@/lib/work/status";

/** Status chip: resolves a {@link WorkStatus} to its label + tone. */
export function StatusBadge({
  status,
  className,
}: {
  status: WorkStatus;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}
