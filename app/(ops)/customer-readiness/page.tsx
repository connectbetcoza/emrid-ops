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

export const metadata: Metadata = { title: "Customer Readiness" };

/**
 * Customer Readiness — a projection over PERSISTED Work Items (the Ops work
 * index) for the READINESS domain: profile-completion, emergency-info, and
 * emergency-contact gaps. No profile query/scan. Selecting an item opens the
 * single Customer Workspace.
 */
export default async function CustomerReadinessPage() {
  const user = await requireOpsUser();
  // Bulk transition affordance is permission-gated (UI convenience; the
  // server action re-enforces per item).
  const canBulk = hasPermission(user, WORK_DOMAIN_PERMISSION.READINESS);
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
        primaryBulkLabel={canBulk ? "Mark complete" : undefined}
        emptyTitle="No readiness work"
        emptyDescription="No readiness gaps are waiting. Every customer is on track."
      />
    </div>
  );
}
