"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { CustomerListItem } from "@/components/customers/CustomerListItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { searchCustomers } from "@/lib/customers/queries";
import type { Customer } from "@/lib/customers/types";

/**
 * Intentionally minimal Customers index: search + a list that opens the single
 * Customer Workspace. NOT a customer-management module — no editing, no detail
 * page. It is a search-oriented entry point that becomes a secondary aid once
 * queues drive the primary workflow. Selecting a customer always navigates to
 * `/customers/[id]` (handled by CustomerListItem).
 */
export function CustomersIndex({ customers }: { customers: Customer[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchCustomers(customers, query),
    [customers, query],
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search customers"
          placeholder="Search customers by name, email, or location…"
          className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        />
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description={`Nothing matches “${query}”. Try a different search.`}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            {results.length} customer{results.length === 1 ? "" : "s"}
          </div>
          <ul role="list" className="divide-y divide-border">
            {results.map((customer) => (
              <li key={customer.id}>
                <CustomerListItem customer={customer} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
