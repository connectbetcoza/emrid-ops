import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Customer Support" };

export default function CustomerSupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Support"
        description="Resolve customer queries and manage support work."
      />
      <SectionPlaceholder
        icon={LifeBuoy}
        title="Customer Support is coming soon"
        description="The support inbox and workspace for handling customer queries end to end."
      />
    </div>
  );
}
