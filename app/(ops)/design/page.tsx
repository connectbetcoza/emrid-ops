import type { Metadata } from "next";
import { Activity, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionTitle } from "@/components/ui/Typography";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { MetricCard } from "@/components/ui/MetricCard";
import {
  CircularProgress,
  LinearProgress,
} from "@/components/ui/ProgressIndicator";
import { WORK_STATUSES } from "@/lib/work/status";
import { PRIORITIES } from "@/lib/work/priority";
import { QueueShowcase } from "@/components/showcase/QueueShowcase";
import { WorkspaceShowcase } from "@/components/showcase/WorkspaceShowcase";
import { OpenPaletteButton } from "@/components/showcase/OpenPaletteButton";

export const metadata: Metadata = { title: "Design System" };

/**
 * Design-system & framework reference (not part of the primary navigation).
 * A living gallery used for QA, documentation, and design review — it exercises
 * the reusable Queue, the Workspace skeleton, the command palette, and the core
 * primitives with mock data so they can be verified in isolation.
 */
export default function DesignSystemPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="Design System"
        description="Reference gallery for the EMRID Operations component library and frameworks. Mock data only."
        actions={<OpenPaletteButton />}
      />

      {/* Metrics + progress */}
      <section className="space-y-3">
        <SectionTitle>Metrics &amp; progress</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Customers registered"
            value="1,284"
            icon={Users}
            trend={{ label: "+18 today", direction: "up" }}
          />
          <MetricCard
            label="Identities verified"
            value="942"
            icon={CheckCircle2}
            trend={{ label: "+14 today", direction: "up" }}
          />
          <MetricCard
            label="Awaiting review"
            value="6"
            icon={AlertTriangle}
            trend={{ label: "−2", direction: "down" }}
          />
          <Card className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Operational health
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Last 24h</p>
            </div>
            <CircularProgress value={96} label="Operational health 96%" />
          </Card>
        </div>
        <Card className="space-y-3">
          <LinearProgress value={96} tone="success" label="Health" />
          <LinearProgress value={62} tone="warning" label="Capacity" />
          <LinearProgress value={28} tone="danger" label="Overdue" />
        </Card>
      </section>

      {/* Chips */}
      <section className="space-y-3">
        <SectionTitle>Status &amp; priority chips</SectionTitle>
        <Card className="flex flex-wrap items-center gap-2">
          {WORK_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
          {PRIORITIES.map((p) => (
            <PriorityBadge key={p} priority={p} />
          ))}
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
          <Badge tone="primary">Primary</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="neutral">Neutral</Badge>
        </Card>
      </section>

      {/* Buttons */}
      <section className="space-y-3">
        <SectionTitle>Buttons</SectionTitle>
        <Card className="flex flex-wrap items-center gap-2">
          <Button variant="primary">
            <Activity className="h-4 w-4" aria-hidden />
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
        </Card>
      </section>

      {/* Queue framework */}
      <section className="space-y-3">
        <SectionTitle>Queue framework</SectionTitle>
        <QueueShowcase />
      </section>

      {/* Workspace framework */}
      <section className="space-y-3">
        <SectionTitle>Workspace framework</SectionTitle>
        <WorkspaceShowcase />
      </section>
    </div>
  );
}
