import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionPlaceholder } from "@/components/app/SectionPlaceholder";

export const metadata: Metadata = { title: "Administration" };

export default function AdministrationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration"
        description="Staff, roles, and platform configuration."
      />
      <SectionPlaceholder
        icon={Settings}
        title="Administration is coming soon"
        description="Manage Operations staff, role assignments, and platform-wide settings."
      />
    </div>
  );
}
