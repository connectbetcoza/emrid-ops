import type {
  AuditEvent,
  Device,
  DirectoryEntry,
  EmergencyProfile,
  Profile,
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
  const device = devices.find((d) => d.status === "ACTIVE") ?? devices[0];
  return {
    id: profile.profileId,
    fullName: `${profile.firstName} ${profile.lastName}`.trim(),
    email: "",
    joinedAt: profile.createdAt,
    profileComplete: isProfileComplete(profile),
    identityStatus:
      TO_IDENTITY_STATUS[profile.identityVerificationStatus ?? "UNVERIFIED"] ??
      "UNVERIFIED",
    emergencyInfoComplete: hasEmergencyInfo(emergency),
    emergencyContactsCount: emergencyContactCount(emergency),
    cardStatus: device ? TO_CARD_STATUS[device.status] : "NONE",
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
    email: "",
    joinedAt: entry.joinedAt,
    profileComplete: entry.profileComplete,
    identityStatus: TO_IDENTITY_STATUS[entry.identityStatus] ?? "UNVERIFIED",
    emergencyInfoComplete: entry.emergencyInfoComplete,
    emergencyContactsCount: entry.emergencyContactsCount,
    cardStatus: entry.cardStatus,
  };
}
