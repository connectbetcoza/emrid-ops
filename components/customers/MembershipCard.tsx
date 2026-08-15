import { CreditCard, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import type { Membership } from "@/lib/data/entities";
import {
  BILLING_CYCLE_LABEL,
  MEMBERSHIP_PLAN_META,
  MEMBERSHIP_STATUS_META,
} from "@/lib/customers/family";

/**
 * Membership — READ-ONLY projection of the owning account's Patient-side
 * membership. No billing actions, no payment actions, no mutation from Ops.
 * The emergency-access invariant is stated on the card so support never
 * reasons otherwise.
 */
export function MembershipCard({
  membership,
  memberCount,
}: {
  membership: Membership | null;
  memberCount: number;
}) {
  return (
    <Card className="space-y-3">
      <CardTitle>Membership</CardTitle>
      {!membership ? (
        <EmptyState
          icon={CreditCard}
          title="No membership selected"
          description="The account hasn't chosen a package yet."
        />
      ) : (
        <MembershipDetails membership={membership} memberCount={memberCount} />
      )}
      <p className="flex items-start gap-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Membership state never affects emergency access — the card keeps
        working regardless of payment status.
      </p>
    </Card>
  );
}

function MembershipDetails({
  membership,
  memberCount,
}: {
  membership: Membership;
  memberCount: number;
}) {
  const plan = MEMBERSHIP_PLAN_META[membership.plan];
  const status = MEMBERSHIP_STATUS_META[membership.status];
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{plan.label}</p>
          {membership.priceRands !== undefined && membership.billingCycle ? (
            <p className="text-xs text-muted-foreground">
              R{membership.priceRands}{" "}
              {BILLING_CYCLE_LABEL[membership.billingCycle]} (locked at
              selection)
            </p>
          ) : null}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <dl className="space-y-1 text-xs text-muted-foreground">
        {membership.paymentRef ? (
          <div className="flex justify-between gap-2">
            <dt>Payment reference</dt>
            <dd className="font-mono text-foreground">{membership.paymentRef}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>Started</dt>
          <dd>{formatDate(membership.startedAt)}</dd>
        </div>
        {membership.renewalDate ? (
          <div className="flex justify-between gap-2">
            <dt>Renews</dt>
            <dd>{formatDate(membership.renewalDate)}</dd>
          </div>
        ) : null}
        {plan.coveredMembers !== undefined ? (
          <div className="flex justify-between gap-2">
            <dt>Covered members</dt>
            <dd>
              {memberCount} of {plan.coveredMembers}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
