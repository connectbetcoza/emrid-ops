import {
  BadgeCheck,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { ActionPanel } from "@/components/workspace/ActionPanel";
import { MockActionButton } from "@/components/feedback/MockActionButton";
import type { Customer } from "@/lib/customers/types";

/**
 * Quick Actions — the operator's most likely next steps for this customer. The
 * primary action is contextual (the biggest lever toward protection); the rest
 * are common follow-ups. Inert in Sprint 2 — each gives clear "mock" feedback
 * on click via a toast, and is wired to a server action in a later sprint.
 */
export function QuickActions({ customer }: { customer: Customer }) {
  const needsIdentity = customer.identityStatus !== "VERIFIED";
  const needsCard = customer.cardStatus !== "ACTIVE";

  return (
    <ActionPanel title="Quick actions">
      {needsIdentity ? (
        <MockActionButton action="Verify identity" variant="primary" size="sm">
          <BadgeCheck className="h-4 w-4" aria-hidden />
          Verify identity
        </MockActionButton>
      ) : needsCard ? (
        <MockActionButton action="Issue card" variant="primary" size="sm">
          <CreditCard className="h-4 w-4" aria-hidden />
          Issue card
        </MockActionButton>
      ) : (
        <MockActionButton action="Confirm protection" variant="primary" size="sm">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Confirm protection
        </MockActionButton>
      )}
      <MockActionButton action="Messaging" variant="secondary" size="sm">
        <MessageSquare className="h-4 w-4" aria-hidden />
        Message customer
      </MockActionButton>
      <MockActionButton action="Add guardian" variant="secondary" size="sm">
        <UserPlus className="h-4 w-4" aria-hidden />
        Add guardian
      </MockActionButton>
    </ActionPanel>
  );
}
