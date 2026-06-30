import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Card Fulfilment" };

/**
 * Card Fulfilment — the second projection over persisted Work Items
 * (`listByDomain("FULFILMENT")`), rendered through the SAME generic WorkQueue.
 * No card-specific queue or customer view. Card transition persistence is wired
 * in a later phase; reads come from the Ops work index today.
 */
export default async function CardFulfilmentPage() {
  const records = await getWorkItemRepository().listByDomain("FULFILMENT");
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Card Fulfilment"
        description="Card work, projected from the Work Engine. Open an item to work it in the customer's workspace."
      />
      <WorkQueue
        items={items}
        primaryBulkLabel="Mark dispatched"
        emptyTitle="Fulfilment queue is clear"
        emptyDescription="No cards are waiting to be encoded or dispatched."
      />
    </div>
  );
}
