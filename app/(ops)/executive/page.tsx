import type { Metadata } from "next";
import { LineChart } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Executive" };

export default function ExecutivePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive"
        description="Programme-level metrics and operational performance."
      />
      <SectionPlaceholder
        icon={LineChart}
        title="Executive is coming soon"
        description="A leadership view of throughput, SLAs, and the health of the operation."
      />
    </div>
  );
}
