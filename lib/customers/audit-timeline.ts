import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Stethoscope,
  CreditCard,
  Download,
  Eye,
  FileText,
  Mail,
  Nfc,
  Package,
  Pencil,
  ShieldX,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { AuditEvent, AuditActorType } from "@/lib/data/entities";
import type { TimelineEvent } from "@/components/workspace/TimelineArea";
import { formatDateTime } from "@/lib/format";

/**
 * Audit → workspace timeline mapping (pure). The customer's activity timeline
 * is now the REAL append-only audit trail (GSI2, newest first) rather than a
 * derived mock. Known event types get a curated label + icon; unknown types
 * (the shared trail is written by both products and grows) fall back to a
 * humanised form of the type string — never hidden, never crashing.
 */
const EVENT_META: Record<string, { label: string; icon: LucideIcon }> = {
  IDENTITY_VERIFIED: { label: "Identity verified", icon: BadgeCheck },
  IDENTITY_REJECTED: { label: "Identity verification rejected", icon: ShieldX },
  IDENTITY_VERIFICATION_SUBMITTED: {
    label: "Identity verification submitted",
    icon: FileText,
  },
  CARD_ACTIVATED: { label: "Card activated", icon: CreditCard },
  CARD_REQUESTED: { label: "Card requested", icon: CreditCard },
  DEVICE_ACTIVATED: { label: "Device activated", icon: CreditCard },
  DEVICE_TAP_TESTED: { label: "Card tap test", icon: Nfc },
  EMERGENCY_PROFILE_UPDATED: { label: "Emergency profile updated", icon: Pencil },
  EMERGENCY_PROFILE_VIEWED: {
    label: "Emergency profile viewed",
    icon: Eye,
  },
  OPS_WORK_TRANSITION: { label: "Operations update", icon: Pencil },
  PROFILE_CREATED: { label: "Profile created", icon: UserPlus },
  PROFILE_UPDATED: { label: "Profile updated", icon: Pencil },
  DOCUMENT_UPLOAD_REQUESTED: { label: "Document added", icon: FileText },
  PRACTITIONER_APPROVED: { label: "Practitioner account activated", icon: Stethoscope },
  PRACTITIONER_REJECTED: { label: "Practitioner activation declined", icon: ShieldX },
  PRACTITIONER_ONBOARDED: { label: "Practitioner onboarded", icon: Stethoscope },
  PRACTITIONER_UPDATED: { label: "Account details updated", icon: Pencil },
  // Family / shared access (Patient-owned; labels only — metadata is ignored).
  FAMILY_INVITE_ISSUED: { label: "Family invite sent", icon: Mail },
  FAMILY_INVITE_CANCELLED: { label: "Family invite cancelled", icon: Mail },
  PROFILE_ACCESS_GRANTED: { label: "Profile access granted", icon: Users },
  PROFILE_ACCESS_REVOKED: { label: "Profile access removed", icon: UserMinus },
  // Membership (commercial only — never gates emergency access).
  MEMBERSHIP_PACKAGE_SELECTED: { label: "Membership package selected", icon: Package },
  // Device lifecycle (patient-controlled).
  DEVICE_SUSPENDED: { label: "Device suspended", icon: CreditCard },
  DEVICE_REACTIVATED: { label: "Device reactivated", icon: CreditCard },
  DEVICE_REVOKED: { label: "Device revoked", icon: ShieldX },
  // Practitioner consent (patient-owned authority).
  PRACTITIONER_ACCESS_GRANTED: { label: "Practitioner access granted", icon: Stethoscope },
  PRACTITIONER_ACCESS_REVOKED: { label: "Practitioner access revoked", icon: ShieldX },
  PRACTITIONER_PROFILE_VIEWED: { label: "Record viewed by practitioner", icon: Eye },
  PRACTITIONER_DOCUMENT_DOWNLOADED: { label: "Document downloaded by practitioner", icon: Download },
  // Digital Medical ID (wallet pass) — Patient-owned. Curated here so support
  // sees what happened rather than the humanised-type fallback; "revoked"
  // means the QR stopped resolving, NOT that the pass left the phone.
  WALLET_PASS_ISSUED: { label: "Digital Medical ID added to a wallet", icon: Wallet },
  WALLET_PASS_REVOKED: { label: "Digital Medical ID revoked", icon: ShieldX },
  // Practitioner-assisted onboarding + claim.
  PATIENT_ONBOARDED_BY_PRACTITIONER: { label: "Onboarded by practitioner", icon: UserPlus },
  ONBOARDING_CLAIM_ISSUED: { label: "Account claim link issued", icon: Mail },
  ONBOARDING_PROFILE_CLAIMED: { label: "Account claimed by customer", icon: BadgeCheck },
};

const ACTOR_LABEL: Record<AuditActorType, string> = {
  USER: "by the customer",
  GUARDIAN: "by a guardian",
  ADMIN: "by an admin",
  PUBLIC_RESPONDER: "by a first responder",
  PRACTITIONER: "by a practitioner",
  SYSTEM: "by the system",
  OPS: "by operations",
};

/** "SOME_EVENT_TYPE" → "Some event type" (fallback for unknown types). */
function humanise(eventType: string): string {
  const words = eventType.toLowerCase().split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditTimeline(events: AuditEvent[]): TimelineEvent[] {
  return events.map((event) => {
    const meta = EVENT_META[event.eventType];
    return {
      id: event.eventId,
      time: formatDateTime(event.timestamp),
      title: meta?.label ?? humanise(event.eventType),
      description: ACTOR_LABEL[event.actorType],
      icon: meta?.icon,
    };
  });
}
