import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Workspace } from "@/components/workspace/Workspace";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TabbedContentArea } from "@/components/workspace/TabbedContentArea";
import { TimelineArea } from "@/components/workspace/TimelineArea";
import { SummaryPanel } from "@/components/workspace/SummaryPanel";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { ActiveWork } from "@/components/customers/ActiveWork";
import { LinkedPatients } from "@/components/practitioners/LinkedPatients";
import { ApprovalPanel } from "@/components/practitioners/ApprovalPanel";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Text } from "@/components/ui/Typography";
import { auditTimeline } from "@/lib/customers/audit-timeline";
import {
  getAuditRepository,
  getPractitionerRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import { activeWork } from "@/lib/work/projections";
import { formatDate } from "@/lib/format";
import type { PractitionerStatus } from "@/lib/data/entities";

/** Exhaustive practitioner-status display meta (compiler-enforced). */
const PRACTITIONER_STATUS_META: Record<
  PractitionerStatus,
  { label: string; tone: BadgeTone }
> = {
  PENDING: { label: "Pending approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const practitioner = await getPractitionerRepository().getPractitioner(id);
  return { title: practitioner ? practitioner.fullName : "Practitioner" };
}

/**
 * The Practitioner Workspace — the single record surface for an
 * internally-created practitioner account (V1: no public self-registration),
 * composed from the SAME Workspace framework as the Customer
 * Workspace (one skeleton, another record type — the pattern the framework was
 * built for). Approval lives in the actions rail; the timeline is the real
 * audit trail. NOTE: the practitioner contract has NO document uploads —
 * the registration credential (registration number) is the submitted evidence.
 */
export default async function PractitionerWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const practitioner = await getPractitionerRepository().getPractitioner(id);
  if (!practitioner) notFound();

  const [practice, patientAccess, records, auditEvents] = await Promise.all([
    getPractitionerRepository().getPractice(practitioner.practiceId),
    getPractitionerRepository().listPatientAccess(id),
    getWorkItemRepository().listForCustomer(id),
    getAuditRepository().listForTarget("USER", id),
  ]);
  const work = activeWork(records.map(recordToWorkItem), id);
  const approvalItem =
    work.find((w) => w.type === "APPROVE_PRACTITIONER") ?? null;
  const status = PRACTITIONER_STATUS_META[practitioner.status];

  return (
    <div className="space-y-4">
      <Link
        href="/practitioners"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Practitioners
      </Link>

      <Workspace
        header={
          <WorkspaceHeader
            eyebrow={`Practitioner · ${practitioner.practitionerId}`}
            title={practitioner.fullName}
            badges={<Badge tone={status.tone}>{status.label}</Badge>}
          />
        }
        summary={
          <SummaryPanel
            items={[
              { label: "Email", value: practitioner.email },
              {
                label: "Registration number",
                value: practitioner.registrationNumber ?? "Not provided",
              },
              { label: "Practice", value: practice?.name ?? practitioner.practiceId },
              { label: "Practice phone", value: practice?.phone ?? "—" },
              { label: "Practice address", value: practice?.address ?? "—" },
              { label: "Applied", value: formatDate(practitioner.createdAt) },
            ]}
          />
        }
        actions={
          <ActionPanel title="Approval">
            <ApprovalPanel
              item={approvalItem}
              status={practitioner.status}
              statusNotes={practitioner.statusNotes}
            />
          </ActionPanel>
        }
        timeline={<TimelineArea events={auditTimeline(auditEvents)} />}
      >
        <TabbedContentArea
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <div className="space-y-4">
                  <Text>
                    {practitioner.fullName} is an internally-created
                    practitioner account
                    {practice ? ` at ${practice.name}` : ""}
                    {practitioner.registrationNumber
                      ? `, registration number ${practitioner.registrationNumber}`
                      : ", no registration number on file"}
                    . {status.label}.
                  </Text>
                  <ActiveWork items={work} />
                  <LinkedPatients grants={patientAccess} />
                </div>
              ),
            },
            {
              id: "work",
              label:
                work.length > 0 ? `Active work · ${work.length}` : "Active work",
              content: <ActiveWork items={work} />,
            },
          ]}
        />
      </Workspace>
    </div>
  );
}
