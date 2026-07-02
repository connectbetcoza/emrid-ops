import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Customer Readiness" };

/**
 * Customer Readiness — a projection over PERSISTED Work Items (the Ops work
 * index) for the READINESS domain: profile-completion, emergency-info, and
 * emergency-contact gaps. No profile query/scan. Selecting an item opens the
 * single Customer Workspace.
 */
export default async function CustomerReadinessPage() {
  const records = await getWorkItemRepository().listByDomain("READINESS");
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Readiness"
        description="Readiness gaps, projected from the Work Engine. Open an item to work it in the customer's workspace."
      />
      <WorkQueue
        items={items}
        primaryBulkLabel="Mark complete"
        emptyTitle="No readiness work"
        emptyDescription="No readiness gaps are waiting. Every customer is on track."
      />
    </div>
  );
}
