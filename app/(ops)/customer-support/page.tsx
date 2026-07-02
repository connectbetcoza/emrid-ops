import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Customer Support" };

/**
 * Customer Support — a projection over PERSISTED Work Items for the SUPPORT
 * domain. Support queries are Work Items like everything else; resolving one is
 * an audited work transition. Selecting an item opens the Customer Workspace.
 */
export default async function CustomerSupportPage() {
  const records = await getWorkItemRepository().listByDomain("SUPPORT");
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Support"
        description="Support queries, projected from the Work Engine. Open an item to work it in the customer's workspace."
      />
      <WorkQueue
        items={items}
        primaryBulkLabel="Resolve"
        emptyTitle="Support queue is clear"
        emptyDescription="No customer queries are waiting."
      />
    </div>
  );
}
