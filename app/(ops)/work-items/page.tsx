import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Work Items" };

export default function WorkItemsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Items"
        description="A unified queue of operational work across every domain."
      />
      <SectionPlaceholder
        icon={ListChecks}
        title="Work Items is coming soon"
        description="A cross-domain queue powered by the reusable Queue framework built in this sprint."
      />
    </div>
  );
}
