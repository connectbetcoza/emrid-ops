import { UserX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

/** Contextual not-found for an unknown customer id. */
export default function CustomerNotFound() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <EmptyState
        icon={UserX}
        title="Customer not found"
        description="This customer doesn’t exist or may have been removed. Try searching from the Customers index."
        action={<ButtonLink href="/customers">Back to customers</ButtonLink>}
      />
    </div>
  );
}
