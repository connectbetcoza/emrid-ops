import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Placeholder body for navigation sections whose functionality lands in a
 * later sprint. Keeps every route navigable and on-brand without overbuilding
 * Sprint 1 — the foundation is real; the capability is scheduled.
 */
export function SectionPlaceholder({
  icon,
  title,
  description,
  sprint = "Planned",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  sprint?: string;
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={<Badge tone="primary">{sprint}</Badge>}
    />
  );
}
