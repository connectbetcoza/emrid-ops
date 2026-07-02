import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import { WORK_DOMAINS } from "@/lib/work/work-type";

export const metadata: Metadata = { title: "Work Items" };

/**
 * Work Items — the whole Work Engine in one view: every domain's persisted
 * Work Items through the one generic queue. Domain queues remain the focused
 * daily surfaces; this is the cross-domain projection.
 */
export default async function WorkItemsPage() {
  const perDomain = await Promise.all(
    WORK_DOMAINS.map((d) => getWorkItemRepository().listByDomain(d)),
  );
  const items = perDomain.flat().map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Items"
        description="All operational work across every domain, projected from the Work Engine."
      />
      <WorkQueue
        items={items}
        emptyTitle="No work anywhere"
        emptyDescription="Every queue is clear across all domains."
      />
    </div>
  );
}
