import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { WorkItemCard } from "@/components/work/WorkItemCard";
import { runWorkEngine } from "@/lib/engines/work";

/**
 * "Today's Work" widget — the operator's most pressing open items, fed by the
 * Work Engine. Reuses the shared WorkItemCard. Mock data only.
 */
const TODAYS_WORK = runWorkEngine(4);

export function TodaysWork() {
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
      <div className="grid gap-3 sm:grid-cols-2">
        {TODAYS_WORK.map((item) => (
          <WorkItemCard key={item.id} item={item} />
        ))}
      </div>
    </Card>
  );
}
