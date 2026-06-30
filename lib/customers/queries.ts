import type { Customer } from "@/lib/customers/types";
import { readinessForCustomer } from "@/lib/customers/readiness";
import { type ReadinessBand, READINESS_BANDS } from "@/lib/readiness/core";

/**
 * Pure, reusable customer queries built on the Readiness domain. Used by the
 * Customers index (search), Mission Control ("who needs attention" +
 * distribution), and any future queue. No React/AWS — fully testable.
 */

/** Count customers in each readiness band. */
export function readinessDistribution(
  customers: Customer[],
): Record<ReadinessBand, number> {
  const counts: Record<ReadinessBand, number> = {
    READY: 0,
    NEARLY: 0,
    NOT_READY: 0,
  };
  for (const c of customers) {
    counts[readinessForCustomer(c).band] += 1;
  }
  return counts;
}

/** Customers most in need of attention — lowest readiness first. */
export function needsAttention(customers: Customer[], limit?: number): Customer[] {
  const sorted = customers
    .slice()
    .sort(
      (a, b) =>
        readinessForCustomer(a).score - readinessForCustomer(b).score,
    );
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/** Case-insensitive search over name, email, location, and id. */
export function searchCustomers(
  customers: Customer[],
  query: string,
): Customer[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return customers;
  return customers.filter((c) =>
    [c.fullName, c.email, c.location ?? "", c.id]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

/** Total customers represented across the readiness bands (for legends). */
export function readinessTotal(
  distribution: Record<ReadinessBand, number>,
): number {
  return READINESS_BANDS.reduce((sum, band) => sum + distribution[band], 0);
}
