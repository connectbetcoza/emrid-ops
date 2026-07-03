import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Stethoscope,
  CreditCard,
  Eye,
  FileText,
  Nfc,
  Pencil,
  ShieldX,
  UserPlus,
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
