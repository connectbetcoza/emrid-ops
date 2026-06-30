import { Badge } from "@/components/ui/Badge";
import { priorityMeta, type Priority } from "@/lib/work/priority";

/** Priority chip: resolves a {@link Priority} to its label + tone. */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const meta = priorityMeta(priority);
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
