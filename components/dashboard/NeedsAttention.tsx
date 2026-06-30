import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { CustomerListItem } from "@/components/customers/CustomerListItem";
import { getAllCustomerStates } from "@/lib/customers/state";
import { needsAttention } from "@/lib/customers/queries";

/**
 * "Who needs attention?" — the customers with the lowest readiness, each
 * opening straight into the Customer Workspace. Sourced from repo-backed
 * customer state (identity from the ProfileRepository), so it reflects Ops
 * approvals after a refresh.
 */
export async function NeedsAttention() {
  const attention = needsAttention(await getAllCustomerStates(), 4);
  return (
    <Card padded={false} className="p-5">
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <Link
          href="/customers"
          className="text-xs font-medium text-primary hover:underline"
        >
          All customers
        </Link>
      </CardHeader>
      <div className="-mx-5 divide-y divide-border border-y border-border">
        {attention.map((customer) => (
          <CustomerListItem key={customer.id} customer={customer} />
        ))}
      </div>
    </Card>
  );
}
