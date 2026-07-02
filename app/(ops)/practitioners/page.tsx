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

const STATUS_TONE: Record<PractitionerStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  SUSPENDED: "warning",
  REJECTED: "danger",
};

/**
 * Practitioners — the roster of INTERNALLY-CREATED practitioner accounts (V1:
 * no public self-registration; the EMRID team creates accounts and shares
 * credentials manually). The list is the practitioner directory projection;
 * each row opens the Practitioner Workspace. Any open practitioner work
 * (admin-created pending records) projects through the one generic queue below.
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
        description="Internally-created practitioner accounts and their practices. Accounts are created by the EMRID team in V1 — there is no public sign-up."
      />

      <Card className="space-y-3">
        <CardTitle>Practitioner roster</CardTitle>
        {practitioners.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No practitioners yet"
            description="Practitioner accounts are created internally by the EMRID team. Created accounts appear here."
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
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
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
