import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

export type LinkedPractitioner = {
  practitionerId: string;
  fullName: string;
  practiceName?: string;
  grantedAt: string;
  /** Grant status — REVOKED grants are shown honestly, not hidden. */
  active: boolean;
};

/**
 * The customer's practitioner access grants (read-only — patients own
 * granting). Rows link to the Practitioner Workspace.
 */
export function PractitionersCard({
  practitioners,
}: {
  practitioners: LinkedPractitioner[];
}) {
  return (
    <Card className="space-y-3">
      <CardTitle>Practitioners</CardTitle>
      {practitioners.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No linked practitioners"
          description="No practitioner has access to this customer."
        />
      ) : (
        <ul className="space-y-2.5">
          {practitioners.map((p) => (
            <li
              key={p.practitionerId}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <Link
                  href={`/practitioners/${p.practitionerId}`}
                  className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  {p.fullName}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {p.practiceName ? `${p.practiceName} · ` : ""}
                  granted {formatDate(p.grantedAt)}
                </p>
              </div>
              <Badge tone={p.active ? "success" : "neutral"}>
                {p.active ? "Active" : "Revoked"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
