import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { PractitionerAccess } from "@/lib/data/entities";

/**
 * The practitioner's patient access grants (read-only mirror of the
 * patient-owned access model — Ops never grants or revokes; patients do).
 * Each ACTIVE grant links into the one Customer Workspace.
 */
export function LinkedPatients({ grants }: { grants: PractitionerAccess[] }) {
  return (
    <Card className="space-y-3">
      <CardTitle className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
        Linked patients
      </CardTitle>
      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No patient access grants. Patients grant access from their own
          account — Operations never grants access on their behalf.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {grants.map((grant) => (
            <li key={grant.accessId} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <Link
                  href={`/customers/${grant.profileId}`}
                  className="block truncate text-sm font-medium text-foreground hover:text-primary"
                >
                  {grant.profileId}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  Granted {formatDate(grant.grantedAt)}
                  {grant.revokedAt ? ` · revoked ${formatDate(grant.revokedAt)}` : ""}
                </span>
              </span>
              <Badge tone={grant.status === "ACTIVE" ? "success" : "neutral"}>
                {grant.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
