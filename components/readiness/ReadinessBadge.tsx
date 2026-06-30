import { Badge } from "@/components/ui/Badge";
import { readinessBandMeta, type ReadinessBand } from "@/lib/readiness/core";

/**
 * Readiness band chip. The canonical way to show a readiness band anywhere
 * (queues, lists, workspace). Optionally prefixes the score, e.g. "91% · Ready
 * for Protection".
 */
export function ReadinessBadge({
  band,
  score,
  className,
}: {
  band: ReadinessBand;
  score?: number;
  className?: string;
}) {
  const meta = readinessBandMeta(band);
  return (
    <Badge tone={meta.tone} dot className={className}>
      {score !== undefined ? `${score}% · ${meta.label}` : meta.label}
    </Badge>
  );
}
