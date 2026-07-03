"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Stethoscope } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { searchPractitioners } from "@/lib/practitioners/manage-core";
import type {
  PractitionerDirectoryEntry,
  PractitionerStatus,
} from "@/lib/data/entities";

const STATUS_META: Record<PractitionerStatus, { label: string; tone: BadgeTone }> = {
  APPROVED: { label: "Active", tone: "success" },
  PENDING: { label: "Pending activation", tone: "warning" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REJECTED: { label: "Deactivated", tone: "danger" },
};

/**
 * Practitioner roster — search + list over the directory projection, opening
 * the Practitioner Workspace. Patient-management feel, for practitioners.
 */
export function PractitionerRoster({
  practitioners,
}: {
  practitioners: PractitionerDirectoryEntry[];
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchPractitioners(practitioners, query),
    [practitioners, query],
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search practitioners by name, email, or practice…"
          aria-label="Search practitioners"
          className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={query ? "No matching practitioners" : "No practitioners yet"}
          description={
            query
              ? "Try a different name, email, or practice."
              : "Onboard the first practitioner to start the roster."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {results.map((p) => {
            const status = STATUS_META[p.status];
            return (
              <li key={p.practitionerId}>
                <Link
                  href={`/practitioners/${p.practitionerId}`}
                  className="flex items-center justify-between gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {p.fullName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.practiceName ?? p.practiceId} · {p.email}
                    </span>
                  </span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
