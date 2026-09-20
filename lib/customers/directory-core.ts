import {
  cardActiveFacet,
  isPhysicalDevice,
  type AuditEvent,
  type Device,
  type DirectoryEntry,
  type EmergencyProfile,
  type Profile,
} from "@/lib/data/entities";
import type { WorkItemRecord } from "@/lib/data/work-record";
import type { CardStatus, Customer, IdentityStatus } from "@/lib/customers/types";
import {
  emergencyContactCount,
  hasEmergencyInfo,
  isProfileComplete,
} from "@/lib/customers/facets";
import {
  protectionStatus,
  readinessForCustomer,
} from "@/lib/customers/readiness";

/**
 * Customer Directory derivation — PURE. One function turns source-of-truth
 * reads (profile, emergency, devices, work, audit) into the directory entry,
 * routing protection/readiness through the SAME cores every other surface uses,
 * so the directory can never disagree with the Workspace. Recompute-from-truth
 * means a replayed refresh rewrites the identical entry (idempotent).
 */
const TO_IDENTITY_STATUS: Record<string, IdentityStatus> = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "UNVERIFIED",
};

const TO_CARD_STATUS: Record<Device["status"], CardStatus> = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REVOKED: "NONE",
  REPLACED: "NONE",
};

const ACTIVE_WORK = new Set(["OPEN", "IN_PROGRESS", "WAITING", "BLOCKED"]);

/** The customer view-model the readiness/protection cores consume. */
export function customerFromState(input: {
  profile: Profile;
  emergency: EmergencyProfile | null;
  devices: Device[];
}): Customer {
  const { profile, emergency, devices } = input;
  /*
   * cardStatus counts PHYSICAL products only — a deliberate decision, not a
   * side effect of the reduction below.
   *
   * It feeds the "Card active" readiness factor (weight 15) and the cardActive
   * facet of Protection Status, which drives the Protected Lives aggregate.
   * That metric means an identity-verified, physically-shipped credential;
   * counting a Digital Medical ID would restate the north-star figure for
   * customers who never received a card.
   *
   * The ACTIVE case goes through `cardActiveFacet`, which the Work Engine's
   * boundary detection also uses. That shared call is the point: if this
   * projection and the producer ever disagreed about what "card active" means,
   * the Protected-Lives delta would ratchet — each device change emitting an
   * increment the next directory refresh silently takes back.
   *
   * To make a wallet pass confer protection, change `cardActiveFacet` — once —
   * and expect the aggregate to need a reconciliation run.
   */
  const physical = devices.filter(isPhysicalDevice);
  const device = physical.find((d) => d.status === "ACTIVE") ?? physical[0];
  // Cross-check against the shared facet so this projection can never drift
  // from the Work Engine's Protected-Lives detection, which uses it directly.
  const cardStatus: CardStatus = cardActiveFacet(devices)
    ? "ACTIVE"
    : device
      ? TO_CARD_STATUS[device.status]
      : "NONE";
  return {
    id: profile.profileId,
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    emrid: profile.emrid,
    accountStatus: profile.status,
    email: profile.contactEmail ?? "",
    mobile: profile.contactMobile,
    joinedAt: profile.createdAt,
    profileComplete: isProfileComplete(profile),
    identityStatus:
      TO_IDENTITY_STATUS[profile.identityVerificationStatus ?? "UNVERIFIED"] ??
      "UNVERIFIED",
    emergencyInfoComplete: hasEmergencyInfo(emergency),
    emergencyContactsCount: emergencyContactCount(emergency),
    cardStatus,
  };
}

export function buildDirectoryEntry(input: {
  profile: Profile;
  emergency: EmergencyProfile | null;
  devices: Device[];
  workRecords: WorkItemRecord[];
  /** Newest-first audit events (only [0] is used); [] when none. */
  auditEvents: AuditEvent[];
  now: string;
}): DirectoryEntry {
  const customer = customerFromState(input);
  return {
    profileId: input.profile.profileId,
    emrid: input.profile.emrid,
    firstName: input.profile.firstName,
    lastName: input.profile.lastName,
    displayName: customer.fullName,
    identityStatus: input.profile.identityVerificationStatus ?? "UNVERIFIED",
    verificationLevel: input.profile.verificationLevel,
    protectionStatus: protectionStatus(customer),
    readinessScore: readinessForCustomer(customer).score,
    activeWorkCount: input.workRecords.filter((w) => ACTIVE_WORK.has(w.status))
      .length,
    lastActivityAt: input.auditEvents[0]?.timestamp ?? null,
    profileComplete: customer.profileComplete,
    emergencyInfoComplete: customer.emergencyInfoComplete,
    emergencyContactsCount: customer.emergencyContactsCount,
    cardStatus: customer.cardStatus,
    joinedAt: input.profile.createdAt,
    updatedAt: input.now,
  };
}

/** Directory entry → the Customer view-model the index/widgets consume. */
export function entryToCustomer(entry: DirectoryEntry): Customer {
  return {
    id: entry.profileId,
    fullName: entry.displayName,
    emrid: entry.emrid,
    email: "",
    joinedAt: entry.joinedAt,
    profileComplete: entry.profileComplete,
    identityStatus: TO_IDENTITY_STATUS[entry.identityStatus] ?? "UNVERIFIED",
    emergencyInfoComplete: entry.emergencyInfoComplete,
    emergencyContactsCount: entry.emergencyContactsCount,
    cardStatus: entry.cardStatus,
  };
}
