import { BadgeCheck, Clock, CreditCard, UserPlus } from "lucide-react";
import type { TimelineEvent } from "@/components/workspace/TimelineArea";
import type { SummaryItem } from "@/components/workspace/SummaryPanel";
import { formatDate } from "@/lib/format";
import type {
  CardStatus,
  Customer,
  IdentityStatus,
} from "@/lib/customers/types";

/**
 * Pure builders for the Customer Workspace's content, derived from the customer
 * record. Keeping these here (not in the page) makes the workspace's data shape
 * testable and consistent. Mock/deterministic in Sprint 2.
 */

const IDENTITY_LABEL: Record<IdentityStatus, string> = {
  UNVERIFIED: "Not submitted",
  PENDING: "Pending review",
  VERIFIED: "Verified",
};

const CARD_LABEL: Record<CardStatus, string> = {
  NONE: "Not issued",
  PENDING: "In fulfilment",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

export function identityLabel(status: IdentityStatus): string {
  return IDENTITY_LABEL[status];
}

export function cardLabel(status: CardStatus): string {
  return CARD_LABEL[status];
}

/** Key/value summary for the workspace SummaryPanel. */
export function customerSummary(c: Customer): SummaryItem[] {
  return [
    { label: "Email", value: c.email },
    { label: "Mobile", value: c.mobile ?? "—" },
    { label: "Location", value: c.location ?? "—" },
    { label: "Joined", value: formatDate(c.joinedAt) },
    { label: "Identity", value: identityLabel(c.identityStatus) },
    { label: "Card", value: cardLabel(c.cardStatus) },
  ];
}

/** Activity timeline derived from the customer's current state. */
export function customerTimeline(c: Customer): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (c.cardStatus === "ACTIVE") {
    events.push({
      id: "card",
      time: "Recently",
      title: "Card activated",
      description: "Customer is now protected.",
      icon: CreditCard,
    });
  } else if (c.cardStatus === "PENDING") {
    events.push({
      id: "card",
      time: "In progress",
      title: "Card in fulfilment",
      icon: CreditCard,
    });
  }

  if (c.identityStatus === "VERIFIED") {
    events.push({
      id: "identity",
      time: "Earlier",
      title: "Identity verified",
      icon: BadgeCheck,
    });
  } else if (c.identityStatus === "PENDING") {
    events.push({
      id: "identity",
      time: "Awaiting review",
      title: "Identity submitted",
      description: "Awaiting officer review.",
      icon: Clock,
    });
  }

  events.push({
    id: "joined",
    time: formatDate(c.joinedAt),
    title: "Customer registered",
    icon: UserPlus,
  });

  return events;
}

