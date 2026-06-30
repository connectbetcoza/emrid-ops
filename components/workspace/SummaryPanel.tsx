import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/Card";

export type SummaryItem = { label: string; value: ReactNode };

/**
 * Key/value summary of a record — the "properties" rail of a workspace.
 * Renders a definition list so labels and values are semantically associated.
 */
export function SummaryPanel({
  title = "Summary",
  items,
}: {
  title?: string;
  items: SummaryItem[];
}) {
  return (
    <Card className="space-y-3">
      <CardTitle>{title}</CardTitle>
      <dl className="space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="text-right text-sm font-medium text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
