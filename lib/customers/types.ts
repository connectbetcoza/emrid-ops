import type { ISODateString } from "@/types";

export type IdentityStatus = "UNVERIFIED" | "PENDING" | "VERIFIED";
export type CardStatus = "NONE" | "PENDING" | "ACTIVE" | "SUSPENDED";

/** Whether a customer is actually protected right now. Distinct from Readiness. */
export type ProtectionStatus = "PROTECTED" | "IN_PROGRESS" | "UNPROTECTED";

/**
 * A customer record. Carries the raw facets Readiness and Protection Status are
 * derived from (see `lib/customers/readiness`) — never a precomputed score, so
 * there is one source of truth. Sprint 2 instances are mock.
 */
export type AccountStatus = "ACTIVE" | "INACTIVE" | "LEGACY" | "DELETED";

export type Customer = {
  id: string;
  fullName: string;
  /** Human-readable EMRID code (absent only for malformed legacy data). */
  emrid?: string;
  /** Profile lifecycle status (unavailable on the directory-entry path). */
  accountStatus?: AccountStatus;
  /** Contact details projected from the Profile (blank for legacy profiles). */
  email: string;
  mobile?: string;
  joinedAt: ISODateString;

  // Readiness / protection facets
  profileComplete: boolean;
  identityStatus: IdentityStatus;
  emergencyInfoComplete: boolean;
  emergencyContactsCount: number;
  cardStatus: CardStatus;
};
