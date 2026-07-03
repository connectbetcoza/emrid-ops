import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  CreditCard,
  HeartPulse,
  LifeBuoy,
  Phone,
  Stethoscope,
  UserCog,
} from "lucide-react";
import type { Priority } from "@/lib/work/priority";

/**
 * The operational domain a unit of work belongs to. A queue is a projection of
 * work items filtered to one domain — the domain is what binds a work type to
 * its queue (Identity Verification, Card Fulfilment, …).
 */
export type WorkDomain =
  | "READINESS"
  | "IDENTITY"
  | "FULFILMENT"
  | "PRACTITIONER"
  | "SUPPORT";

export const WORK_DOMAINS: readonly WorkDomain[] = [
  "READINESS",
  "IDENTITY",
  "FULFILMENT",
  "PRACTITIONER",
  "SUPPORT",
];

export const WORK_DOMAIN_LABEL: Record<WorkDomain, string> = {
  READINESS: "Customer Readiness",
  IDENTITY: "Identity Verification",
  FULFILMENT: "Card Fulfilment",
  PRACTITIONER: "Practitioners",
  SUPPORT: "Customer Support",
};

/** The queue route each domain projects into. */
export const WORK_DOMAIN_HREF: Record<WorkDomain, string> = {
  READINESS: "/customer-readiness",
  IDENTITY: "/identity-verification",
  FULFILMENT: "/card-fulfilment",
  PRACTITIONER: "/practitioners",
  SUPPORT: "/customer-support",
};

/**
 * The kind of a work item — the most specific classification the Work Engine
 * uses. Each type maps to exactly one domain (and therefore one queue). This is
 * an exhaustive `Record`: a new type must declare its metadata.
 */
export type WorkType =
  | "VERIFY_IDENTITY"
  | "ISSUE_CARD"
  | "COMPLETE_PROFILE"
  | "ADD_EMERGENCY_INFO"
  | "ADD_EMERGENCY_CONTACT"
  | "APPROVE_PRACTITIONER"
  | "RESOLVE_SUPPORT_QUERY";

export type WorkTypeMeta = {
  label: string;
  domain: WorkDomain;
  icon: LucideIcon;
  /** Default priority before rule-based escalation. */
  defaultPriority: Priority;
  /** Default next action shown on the work item. */
  nextAction: string;
};

export const WORK_TYPE_META: Record<WorkType, WorkTypeMeta> = {
  VERIFY_IDENTITY: {
    label: "Verify identity",
    domain: "IDENTITY",
    icon: BadgeCheck,
    defaultPriority: "HIGH",
    nextAction: "Review submitted ID document",
  },
  ISSUE_CARD: {
    label: "Issue & activate card",
    domain: "FULFILMENT",
    icon: CreditCard,
    defaultPriority: "HIGH",
    nextAction: "Encode, tap-test and dispatch card",
  },
  COMPLETE_PROFILE: {
    label: "Complete customer profile",
    domain: "READINESS",
    icon: UserCog,
    defaultPriority: "LOW",
    nextAction: "Reach out for missing details",
  },
  ADD_EMERGENCY_INFO: {
    label: "Add emergency medical info",
    domain: "READINESS",
    icon: HeartPulse,
    defaultPriority: "MEDIUM",
    nextAction: "Capture blood type, allergies, medication",
  },
  ADD_EMERGENCY_CONTACT: {
    label: "Add an emergency contact",
    domain: "READINESS",
    icon: Phone,
    defaultPriority: "LOW",
    nextAction: "Capture next-of-kin contact",
  },
  APPROVE_PRACTITIONER: {
    label: "Activate practitioner",
    domain: "PRACTITIONER",
    icon: Stethoscope,
    defaultPriority: "MEDIUM",
    nextAction: "Verify registration and activate",
  },
  RESOLVE_SUPPORT_QUERY: {
    label: "Resolve support query",
    domain: "SUPPORT",
    icon: LifeBuoy,
    defaultPriority: "MEDIUM",
    nextAction: "Respond to the customer",
  },
};

export const WORK_TYPES: readonly WorkType[] = [
  "VERIFY_IDENTITY",
  "ISSUE_CARD",
  "COMPLETE_PROFILE",
  "ADD_EMERGENCY_INFO",
  "ADD_EMERGENCY_CONTACT",
  "APPROVE_PRACTITIONER",
  "RESOLVE_SUPPORT_QUERY",
];

export function workTypeMeta(type: WorkType): WorkTypeMeta {
  return WORK_TYPE_META[type];
}

/**
 * The record surface a work item's SUBJECT lives on: practitioner work opens
 * the Practitioner Workspace; everything else opens the Customer Workspace.
 * One helper so no surface hardcodes the route decision.
 */
export function workSubjectHref(domain: WorkDomain, subjectId: string): string {
  return domain === "PRACTITIONER"
    ? `/practitioners/${subjectId}`
    : `/customers/${subjectId}`;
}
