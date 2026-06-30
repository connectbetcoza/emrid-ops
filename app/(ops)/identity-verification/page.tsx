import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Identity Verification" };

/**
 * Identity Verification — a projection over PERSISTED Work Items (the Ops work
 * index), read via `getWorkItemRepository().listByDomain("IDENTITY")`. No
 * profile query/scan. Mock-default; flips to DynamoDB via `USE_MOCK_DATA`.
 * Selecting an item opens the single Customer Workspace.
 */
export default async function IdentityVerificationPage() {
  const records = await getWorkItemRepository().listByDomain("IDENTITY");
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Identity Verification"
        description="Identity work, projected from the Work Engine. Open an item to work it in the customer's workspace."
      />
      <WorkQueue
        items={items}
        primaryBulkLabel="Approve"
        emptyTitle="Identity queue is clear"
        emptyDescription="No identity verifications are waiting. Nicely done."
      />
    </div>
  );
}
