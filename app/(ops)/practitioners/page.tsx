import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { WorkQueue } from "@/components/work/WorkQueue";
import { PractitionerRoster } from "@/components/practitioners/PractitionerRoster";
import { getDirectoryRepository, getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";

export const metadata: Metadata = { title: "Practitioners" };

/**
 * Practitioner Management — patient management, for practitioners. V1:
 * Administration owns creation (the Onboard button — no public sign-up
 * exists); this area supports and manages the accounts. Roster = the
 * directory projection; each entry opens the Practitioner Workspace; open
 * account work projects through the one generic queue.
 */
export default async function PractitionersPage() {
  const [practitioners, records] = await Promise.all([
    getDirectoryRepository().listPractitioners(),
    getWorkItemRepository().listByDomain("PRACTITIONER"),
  ]);
  const items = records.map(recordToWorkItem);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Practitioners"
        description="Practitioner accounts and their practices — onboard, support, and manage."
        actions={
          <ButtonLink href="/practitioners/onboard" size="sm">
            <UserPlus className="h-4 w-4" aria-hidden />
            Onboard practitioner
          </ButtonLink>
        }
      />

      <Card className="space-y-3">
        <CardTitle>Roster</CardTitle>
        <PractitionerRoster practitioners={practitioners} />
      </Card>

      {items.length > 0 ? (
        <div className="space-y-3">
          <CardTitle>Open practitioner work</CardTitle>
          <WorkQueue
            items={items}
            emptyTitle="No practitioner work"
            emptyDescription="No practitioner work is waiting."
          />
        </div>
      ) : null}
    </div>
  );
}
