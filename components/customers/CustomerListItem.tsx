import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ReadinessBadge } from "@/components/readiness/ReadinessBadge";
import { ProtectionStatusBadge } from "@/components/customers/ProtectionStatusBadge";
import {
  protectionStatus,
  readinessForCustomer,
} from "@/lib/customers/readiness";
import type { Customer } from "@/lib/customers/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * A customer row that always opens the single Customer Workspace
 * (`/customers/[id]`). Shows protection status + readiness via the shared
 * domain components. Reused by Mission Control and the Customers index — there
 * is no other customer "view".
 */
export function CustomerListItem({ customer }: { customer: Customer }) {
  const readiness = readinessForCustomer(customer);
  const status = protectionStatus(customer);

  return (
    <Link
      href={`/customers/${customer.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
        {initials(customer.fullName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {customer.fullName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {customer.location ? `${customer.location} · ` : ""}
          {customer.id}
        </p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <ProtectionStatusBadge status={status} />
        <ReadinessBadge band={readiness.band} score={readiness.score} />
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
