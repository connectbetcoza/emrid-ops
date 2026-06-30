import type { Metadata } from "next";
import { PageHeader } from "@/components/app/PageHeader";
import { CustomersIndex } from "@/components/customers/CustomersIndex";
import { getAllCustomerStates } from "@/lib/customers/state";

export const metadata: Metadata = { title: "Customers" };

/**
 * Customers index — a deliberately minimal, search-oriented entry point into
 * the single Customer Workspace. Customer state is repo-backed (identity from
 * the ProfileRepository), so readiness/protection reflect Ops decisions.
 */
export default async function CustomersPage() {
  const customers = await getAllCustomerStates();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Search for a customer to open their workspace."
      />
      <CustomersIndex customers={customers} />
    </div>
  );
}
