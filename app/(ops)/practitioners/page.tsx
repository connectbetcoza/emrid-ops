import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Practitioners" };

export default function PractitionersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Practitioners"
        description="Approve and manage practitioner accounts and their practices."
      />
      <SectionPlaceholder
        icon={Stethoscope}
        title="Practitioners is coming soon"
        description="The approval queue and management workspace for practitioners and practices."
      />
    </div>
  );
}
