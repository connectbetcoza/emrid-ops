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
export type Customer = {
  id: string;
  fullName: string;
  email: string;
  mobile?: string;
  location?: string;
  joinedAt: ISODateString;

  // Readiness / protection facets
  profileComplete: boolean;
  identityStatus: IdentityStatus;
  emergencyInfoComplete: boolean;
  emergencyContactsCount: number;
  cardStatus: CardStatus;
};
