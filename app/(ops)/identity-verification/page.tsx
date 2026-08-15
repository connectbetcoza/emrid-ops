import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { requireOpsUser } from "@/lib/auth/server";
import {
  WORK_DOMAIN_PERMISSION,
  hasPermission,
} from "@/lib/auth/permissions";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Identity Verification" };

/**
 * Identity Verification — a projection over PERSISTED Work Items (the Ops work
 * index), read via `getWorkItemRepository().listByDomain("IDENTITY")`. No
 * profile query/scan. Mock-default; flips to DynamoDB via `USE_MOCK_DATA`.
 * Selecting an item opens the single Customer Workspace.
 */
export default async function IdentityVerificationPage() {
  const user = await requireOpsUser();
  // Bulk transition affordance is permission-gated (UI convenience; the
  // server action re-enforces per item).
  const canBulk = hasPermission(user, WORK_DOMAIN_PERMISSION.IDENTITY);
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
        primaryBulkLabel={canBulk ? "Approve" : undefined}
        emptyTitle="Identity queue is clear"
        emptyDescription="No identity verifications are waiting. Nicely done."
      />
    </div>
  );
}
