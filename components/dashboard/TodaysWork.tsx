import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { WorkItemCard } from "@/components/work/WorkItemCard";
import { runWorkEngine } from "@/lib/engines/work";

/**
 * "Today's Work" widget — the operator's most pressing open items, fed by the
 * Work Engine over the persisted Work Items. Reuses the shared WorkItemCard.
 */
export async function TodaysWork() {
  const items = await runWorkEngine(4);
  return (
    <Card padded={false} className="p-5">
      <CardHeader>
        <CardTitle>Today’s work</CardTitle>
        <Link
          href="/work-items"
          className="text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </CardHeader>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-md bg-success/10 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          No active work anywhere — every queue is clear.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <WorkItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}
