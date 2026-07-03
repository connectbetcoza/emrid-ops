import type { Metadata } from "next";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { WorkQueue } from "@/components/work/WorkQueue";
import { getDirectoryRepository, getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import type { PractitionerStatus } from "@/lib/data/entities";

export const metadata: Metadata = { title: "Practitioners" };

/**
 * Management framing over the SHARED status values (contract unchanged):
 * ACTIVE is the normal operational state; the rest are exceptions.
 */
const STATUS_META: Record<PractitionerStatus, { label: string; tone: BadgeTone }> = {
  APPROVED: { label: "Active", tone: "success" },
  PENDING: { label: "Pending activation", tone: "warning" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REJECTED: { label: "Deactivated", tone: "danger" },
};

/**
 * Practitioners — the support & management surface for practitioner accounts.
 * ADMINISTRATION owns creation (V1: internal, credentials shared manually; no
 * public sign-up exists); this department supports what exists. ACTIVE is the
 * normal operational state. The roster is the directory projection; each row
 * opens the Practitioner Workspace; open account work (e.g. a pending
 * activation) projects through the one generic queue below.
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
        description="Practitioner accounts and their practices. Administration creates accounts; Practitioner Operations supports and manages them."
      />

      <Card className="space-y-3">
        <CardTitle>Practitioner roster</CardTitle>
        {practitioners.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No practitioners yet"
            description="Practitioner accounts are created by Administration. Created accounts appear here for support and management."
          />
        ) : (
          <ul className="divide-y divide-border">
            {practitioners.map((p) => (
              <li key={p.practitionerId}>
                <Link
                  href={`/practitioners/${p.practitionerId}`}
                  className="flex items-center justify-between gap-3 rounded-md py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {p.fullName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.practiceName ?? p.practiceId} · {p.email}
                    </span>
                  </span>
                  <Badge tone={STATUS_META[p.status].tone}>{STATUS_META[p.status].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
