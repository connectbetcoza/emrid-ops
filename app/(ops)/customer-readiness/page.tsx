import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Customer Readiness" };

export default function CustomerReadinessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Readiness"
        description="How prepared each customer is — profile completeness, identity status, and active protection."
      />
      <SectionPlaceholder
        icon={Gauge}
        title="Customer Readiness is coming soon"
        description="A readiness view and queue for moving customers from registered to fully protected."
      />
    </div>
  );
}
