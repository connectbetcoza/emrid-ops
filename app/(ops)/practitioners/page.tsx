import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Practitioners" };

/**
 * Practitioners — a projection over PERSISTED Work Items for the PRACTITIONER
 * domain (approval requests from the Patient Platform's practitioner portal).
 * NOTE: the approval DECISION write (practitioner status) is not wired yet —
 * transitions fail closed with an explicit error until that persistence lands.
 */
export default async function PractitionersPage() {
  const records = await getWorkItemRepository().listByDomain("PRACTITIONER");
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practitioners"
        description="Practitioner approval work, projected from the Work Engine."
      />
      <WorkQueue
        items={items}
        emptyTitle="No practitioner work"
        emptyDescription="No practitioner approvals are waiting."
      />
    </div>
  );
}
