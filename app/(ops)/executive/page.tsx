import type { Metadata } from "next";
import { HeartPulse, ShieldCheck, Inbox } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { getAggregateRepository, getWorkItemRepository } from "@/lib/data";
import { isActiveWork } from "@/lib/work/types";
import { recordToWorkItem } from "@/lib/work/record";
import {
  WORK_DOMAINS,
  WORK_DOMAIN_HREF,
  WORK_DOMAIN_LABEL,
} from "@/lib/work/work-type";

export const metadata: Metadata = { title: "Executive" };

/**
 * Executive — the leadership read of the same operational truth: the
 * repository-backed Protected Lives aggregate and the live open-work backlog
 * per domain. No separate reporting store, no mock figures — everything here
 * is the Work Engine and the Protection Engine, aggregated.
 */
export default async function ExecutivePage() {
  const [aggregate, perDomain] = await Promise.all([
    getAggregateRepository().getProtectedLives(),
    Promise.all(
      WORK_DOMAINS.map(async (domain) => ({
        domain,
        open: (await getWorkItemRepository().listByDomain(domain))
          .map(recordToWorkItem)
          .filter(isActiveWork).length,
      })),
    ),
  ]);
  const backlog = perDomain.reduce((sum, d) => sum + d.open, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive"
        description="The leadership view of protection and operational load — live, repository-backed."
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <MetricCard
          label="Protected lives"
          value={aggregate.protectedCount}
          icon={HeartPulse}
          hint="Customers protected right now"
        />
        <MetricCard
          label="In progress"
          value={aggregate.inProgressCount}
          icon={ShieldCheck}
          hint="Customers on the path to protection"
        />
        <MetricCard
          label="Open work"
          value={backlog}
          icon={Inbox}
          hint="Active work items across all domains"
        />
      </div>
      <Card className="space-y-3">
        <CardTitle>Open work by domain</CardTitle>
        <ul className="divide-y divide-border">
          {perDomain.map(({ domain, open }) => (
            <li key={domain}>
              <Link
                href={WORK_DOMAIN_HREF[domain]}
                className="flex items-center justify-between py-2.5 text-sm transition-colors hover:text-primary"
              >
                <span className="font-medium text-foreground">
                  {WORK_DOMAIN_LABEL[domain]}
                </span>
                <span className="tabular-nums text-muted-foreground">{open}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
