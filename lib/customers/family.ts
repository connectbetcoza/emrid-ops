import type { BadgeTone } from "@/components/ui/Badge";
import type {
  BillingCycle,
  FamilyInviteSummary,
  MembershipPlan,
  MembershipStatus,
  ProfileAccessEntry,
  ProfileAccessRole,
} from "@/lib/data/entities";

/**
 * Family/membership display core (pure). Read-only projections of
 * Patient-owned state — exhaustive Records per Rule 9 so new shared enum
 * values force a display decision at compile time.
 */

export const ROLE_LABEL: Record<ProfileAccessRole, string> = {
  OWNER: "Owner",
  GUARDIAN: "Guardian",
  DEPENDENT: "Dependent",
  VIEWER: "Viewer",
  ADMIN: "Admin",
};

/** Owner first, then members by grant date. Existence of a grant ⇒ active. */
export function splitFamilyAccess(entries: ProfileAccessEntry[]): {
  owner: ProfileAccessEntry | null;
  members: ProfileAccessEntry[];
} {
  const owner = entries.find((e) => e.role === "OWNER") ?? null;
  const members = entries
    .filter((e) => e.role !== "OWNER")
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { owner, members };
}

export type InviteState = "PENDING" | "EXPIRED";

/** Expiry is application-derived, mirroring the Patient read-side rule. */
export function inviteState(
  invite: FamilyInviteSummary,
  nowIso: string,
): InviteState {
  return invite.expiresAt > nowIso ? "PENDING" : "EXPIRED";
}

/**
 * Presentational mirror of the Patient billing catalogue's covered-member
 * counts (lib/billing/packages.ts). Display copy only — entitlement is not
 * enforced on either side yet; keep in sync deliberately on catalogue change.
 */
export const MEMBERSHIP_PLAN_META: Record<
  MembershipPlan,
  { label: string; coveredMembers?: number }
> = {
  INDIVIDUAL: { label: "Individual", coveredMembers: 1 },
  SPOUSAL: { label: "Spousal / Partner", coveredMembers: 2 },
  FAMILY: { label: "Family", coveredMembers: 4 },
  PILOT: { label: "Pilot (legacy)" },
};

export const MEMBERSHIP_STATUS_META: Record<
  MembershipStatus,
  { label: string; tone: BadgeTone }
> = {
  PENDING_PAYMENT: { label: "Pending payment", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  PAST_DUE: { label: "Past due", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "per month",
  ANNUAL: "per year",
};
