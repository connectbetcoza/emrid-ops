import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Workspace } from "@/components/workspace/Workspace";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TabbedContentArea } from "@/components/workspace/TabbedContentArea";
import { TimelineArea } from "@/components/workspace/TimelineArea";
import { SummaryPanel } from "@/components/workspace/SummaryPanel";
import { ReadinessCard } from "@/components/readiness/ReadinessCard";
import { ReadinessBadge } from "@/components/readiness/ReadinessBadge";
import { ProtectionStatusBadge } from "@/components/customers/ProtectionStatusBadge";
import { ActiveWork } from "@/components/customers/ActiveWork";
import { CardFulfilmentPack } from "@/components/customers/CardFulfilmentPack";
import { DevicesCard } from "@/components/customers/DevicesCard";
import { InternalNotes } from "@/components/customers/InternalNotes";
import {
  PractitionersCard,
  type LinkedPractitioner,
} from "@/components/customers/PractitionersCard";
import { QuickActions } from "@/components/customers/QuickActions";
import { SupportQueryPanel } from "@/components/customers/SupportQueryPanel";
import { WorkHistory } from "@/components/customers/WorkHistory";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { Text } from "@/components/ui/Typography";
import { getCustomerState } from "@/lib/customers/state";
import { protectionFor } from "@/lib/protection/state";
import {
  buildFulfilmentPack,
  fulfilmentDevice,
  type FulfilmentPack,
} from "@/lib/customers/fulfilment-pack";
import { customerSummary } from "@/lib/customers/workspace";
import { auditTimeline } from "@/lib/customers/audit-timeline";
import {
  getAuditRepository,
  getDeviceRepository,
  getNoteRepository,
  getPractitionerRepository,
  getProfileRepository,
  getWorkItemRepository,
} from "@/lib/data";
import { config } from "@/lib/config";
import { recordToWorkItem } from "@/lib/work/record";
import { activeWork, workHistory } from "@/lib/work/projections";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const customer = await getCustomerState(id);
  return { title: customer ? customer.fullName : "Customer" };
}

/**
 * The single Customer Workspace. Every queue, Mission Control item, and command
 * palette result resolves here — there is no other customer view. Built from
 * the reusable Workspace framework + the Readiness domain. Mock data only.
 */
export default async function CustomerWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomerState(id);
  if (!customer) notFound();

  const { status, readiness } = protectionFor(customer);
  const [records, auditEvents, notes, devices, accessGrants] =
    await Promise.all([
      getWorkItemRepository().listForCustomer(customer.id),
      getAuditRepository().listForProfile(customer.id),
      getNoteRepository().listForSubject(customer.id),
      getDeviceRepository().listForCustomer(customer.id),
      getPractitionerRepository().listAccessForProfile(customer.id),
    ]);
  const items = records.map(recordToWorkItem);
  const work = activeWork(items, customer.id);
  const history = workHistory(items, customer.id);
  const timeline = auditTimeline(auditEvents);

  // Resolve grant rows to practitioner names (bounded point reads — a customer
  // has at most a handful of grants). Missing records render honestly by id.
  const practitionerRepo = getPractitionerRepository();
  const linkedPractitioners: LinkedPractitioner[] = await Promise.all(
    accessGrants.map(async (grant) => {
      const practitioner = await practitionerRepo.getPractitioner(
        grant.practitionerId,
      );
      const practice = practitioner
        ? await practitionerRepo.getPractice(practitioner.practiceId)
        : null;
      return {
        practitionerId: grant.practitionerId,
        fullName: practitioner?.fullName ?? grant.practitionerId,
        practiceName: practice?.name,
        grantedAt: grant.grantedAt,
        active: grant.status === "ACTIVE",
      };
    }),
  );

  // Card Fulfilment Pack — a Workspace section, shown while the customer has
  // active ISSUE_CARD work so the fulfilment officer never asks "what do I
  // encode?". Assembled from repository state (device + profile EMRID + the
  // device's tap audit trail); null pack ⇒ device not issued yet.
  const hasCardWork = work.some((w) => w.type === "ISSUE_CARD");
  let fulfilmentPack: FulfilmentPack | null = null;
  let showFulfilmentPack = false;
  if (hasCardWork) {
    showFulfilmentPack = true;
    const profile = await getProfileRepository().getProfile(customer.id);
    const device = fulfilmentDevice(devices);
    if (device) {
      const deviceEvents = await getAuditRepository().listForTarget(
        "DEVICE",
        device.deviceId,
      );
      fulfilmentPack = buildFulfilmentPack({
        emrid: profile?.emrid ?? customer.id,
        device,
        deviceEvents,
        patientBaseUrl: config.patientAppUrl,
      });
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href="/customers"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Customers
      </Link>

      <Workspace
        header={
          <WorkspaceHeader
            eyebrow={`Customer · ${customer.id}`}
            title={customer.fullName}
            badges={
              <>
                <ProtectionStatusBadge status={status} />
                <ReadinessBadge band={readiness.band} score={readiness.score} />
              </>
            }
          />
        }
        summary={
          <>
            <ReadinessCard result={readiness} />
            <SummaryPanel items={customerSummary(customer)} />
            {showFulfilmentPack ? (
              <CardFulfilmentPack pack={fulfilmentPack} />
            ) : null}
            <DevicesCard devices={devices} />
            <PractitionersCard practitioners={linkedPractitioners} />
          </>
        }
        actions={
          <>
            <QuickActions work={work} />
            <ActionPanel title="Customer support">
              <SupportQueryPanel customerId={customer.id} />
            </ActionPanel>
          </>
        }
        timeline={<TimelineArea events={timeline} />}
      >
        <TabbedContentArea
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <div className="space-y-4">
                  <Text>
                    {customer.fullName.split(" ")[0]} is{" "}
                    <strong className="font-medium text-foreground">
                      {readiness.score}%
                    </strong>{" "}
                    ready for protection.{" "}
                    {work.length === 0
                      ? "No active work remains."
                      : `${work.length} active work item${work.length === 1 ? "" : "s"}.`}
                  </Text>
                  <ActiveWork items={work} />
                </div>
              ),
            },
            {
              id: "work",
              label: work.length > 0 ? `Active work · ${work.length}` : "Active work",
              content: (
                <div className="space-y-4">
                  <ActiveWork items={work} />
                  <WorkHistory items={history} />
                </div>
              ),
            },
            {
              id: "notes",
              label: notes.length > 0 ? `Notes · ${notes.length}` : "Notes",
              content: <InternalNotes subjectId={customer.id} notes={notes} />,
            },
          ]}
        />
      </Workspace>
    </div>
  );
}
