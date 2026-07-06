import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { ProtectedLivesHero } from "@/components/dashboard/ProtectedLivesHero";
import { MorningBrief } from "@/components/dashboard/MorningBrief";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { TodaysWork } from "@/components/dashboard/TodaysWork";
import { ReadinessDistribution } from "@/components/dashboard/ReadinessDistribution";
import { requireOpsUser } from "@/lib/auth/server";
import { firstName } from "@/types";
import { greeting } from "@/lib/greeting";

export const metadata: Metadata = { title: "Mission Control" };

/**
 * Mission Control — the operational command centre. Not a reporting dashboard:
 * it answers what needs attention, what to do next, and whether the
 * organisation is becoming more protected. Protected Lives is the focal point;
 * every other surface explains its movement. Every surface is live
 * (aggregate/directory/work-index-backed) — hardened for go-live: Mission
 * Control never fabricates. The health/alerts/activity widgets were removed
 * with their deterministic-mock engines and return only when real signals
 * exist to feed them.
 */
export default async function MissionControlPage() {
  const user = await requireOpsUser();
  const hello = greeting(new Date().getHours(), firstName(user));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mission Control"
        description="The operational state of EMRID, at a glance."
      />

      {/* North star — the focal point. */}
      <ProtectedLivesHero />

      <MorningBrief greeting={hello} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NeedsAttention />
          <TodaysWork />
        </div>
        <aside className="space-y-6 lg:col-span-1">
          <ReadinessDistribution />
        </aside>
      </div>
    </div>
  );
}
