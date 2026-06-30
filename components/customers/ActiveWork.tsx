import { CheckCircle2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { WorkItemRow } from "@/components/work/WorkItemRow";
import type { WorkItem } from "@/lib/work/types";

/**
 * Active Work — the customer's open work items, projected from the Work Engine
 * (renamed from "Operational Tasks"). Each item is rendered by the generic
 * `WorkItemRow`, so the operator works *any* work type — Identity today,
 * Fulfilment/Support/Practitioner tomorrow — right here in the one Workspace,
 * with no type-specific UI.
 */
export function ActiveWork({ items }: { items: WorkItem[] }) {
  return (
    <Card className="space-y-4">
      <CardTitle>Active work</CardTitle>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          No active work — this customer is ready for protection.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <WorkItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Card>
  );
}
