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

export const metadata: Metadata = { title: "Customer Support" };

/**
 * Customer Support — a projection over PERSISTED Work Items for the SUPPORT
 * domain. Support queries are Work Items like everything else; resolving one is
 * an audited work transition. Selecting an item opens the Customer Workspace.
 */
export default async function CustomerSupportPage() {
  const user = await requireOpsUser();
  // Bulk transition affordance is permission-gated (UI convenience; the
  // server action re-enforces per item).
  const canBulk = hasPermission(user, WORK_DOMAIN_PERMISSION.SUPPORT);
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
        primaryBulkLabel={canBulk ? "Resolve" : undefined}
        emptyTitle="Support queue is clear"
        emptyDescription="No customer queries are waiting."
      />
    </div>
  );
}
