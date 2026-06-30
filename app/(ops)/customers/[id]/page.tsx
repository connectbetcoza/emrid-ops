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
import { InternalNotes } from "@/components/customers/InternalNotes";
import { QuickActions } from "@/components/customers/QuickActions";
import { Text } from "@/components/ui/Typography";
import { getCustomerState } from "@/lib/customers/state";
import { protectionFor } from "@/lib/protection/state";
import {
  customerNotes,
  customerSummary,
  customerTimeline,
} from "@/lib/customers/workspace";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import { activeWork } from "@/lib/work/projections";

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
  const records = await getWorkItemRepository().listForCustomer(customer.id);
  const work = activeWork(records.map(recordToWorkItem), customer.id);

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
          </>
        }
        actions={<QuickActions customer={customer} />}
        timeline={<TimelineArea events={customerTimeline(customer)} />}
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
              content: <ActiveWork items={work} />,
            },
            {
              id: "notes",
              label: "Notes",
              content: <InternalNotes initialNotes={customerNotes(customer)} />,
            },
          ]}
        />
      </Workspace>
    </div>
  );
}
