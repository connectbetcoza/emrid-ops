import { Users } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import type {
  FamilyInviteSummary,
  ProfileAccessEntry,
} from "@/lib/data/entities";
import {
  ROLE_LABEL,
  inviteState,
  splitFamilyAccess,
} from "@/lib/customers/family";

/**
 * Family / shared access — READ-ONLY projection of Patient-owned grants and
 * pending invites. Never renders invite tokens or URLs (the summaries are
 * token-free by construction); Ops cannot grant, revoke, or invite.
 */
export function FamilyCard({
  access,
  invites,
  now,
}: {
  access: ProfileAccessEntry[];
  invites: FamilyInviteSummary[];
  now: string;
}) {
  const { owner, members } = splitFamilyAccess(access);
  const empty = !owner && members.length === 0 && invites.length === 0;

  return (
    <Card className="space-y-3">
      <CardTitle>Family &amp; access</CardTitle>
      {empty ? (
        <EmptyState
          icon={Users}
          title="No shared access"
          description="Only the account itself can access this profile."
        />
      ) : (
        <ul className="space-y-2.5">
          {owner ? (
            <li className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {owner.memberEmail ?? owner.userId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Since {formatDate(owner.createdAt)}
                </p>
              </div>
              <Badge tone="primary">{ROLE_LABEL.OWNER}</Badge>
            </li>
          ) : null}
          {members.map((member) => (
            <li
              key={member.accessId}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.memberEmail ?? member.userId}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABEL[member.role]} · granted{" "}
                  {formatDate(member.createdAt)}
                </p>
              </div>
              <Badge tone="success">Active</Badge>
            </li>
          ))}
          {invites.map((invite) => {
            const state = inviteState(invite, now);
            return (
              <li
                key={invite.inviteId}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {invite.inviteEmail}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Invited as {ROLE_LABEL[invite.role]} ·{" "}
                    {state === "PENDING"
                      ? `expires ${formatDate(invite.expiresAt)}`
                      : `expired ${formatDate(invite.expiresAt)}`}
                  </p>
                </div>
                <Badge tone={state === "PENDING" ? "warning" : "neutral"}>
                  {state === "PENDING" ? "Invite pending" : "Invite expired"}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
