import type { BadgeTone } from "@/components/ui/Badge";
import {
  computeReadiness,
  type ReadinessFactor,
  type ReadinessResult,
} from "@/lib/readiness/core";
import type { Customer, ProtectionStatus } from "@/lib/customers/types";

/**
 * The customer → Readiness bridge. Maps a customer's facets onto weighted
 * readiness factors and derives Protection Status. This is where the *domain*
 * meaning of readiness lives; the scoring maths is the generic
 * `computeReadiness` core. Pure + testable; reused everywhere a customer's
 * readiness or protection is shown.
 */

/** The factors that make a customer ready for protection (weights sum to 100). */
export function customerReadinessFactors(c: Customer): ReadinessFactor[] {
  return [
    { key: "profile", label: "Profile complete", weight: 15, met: c.profileComplete },
    {
      key: "identity",
      label: "Identity verified",
      weight: 30,
      met: c.identityStatus === "VERIFIED",
    },
    {
      key: "emergency",
      label: "Emergency info added",
      weight: 25,
      met: c.emergencyInfoComplete,
    },
    {
      key: "contact",
      label: "Emergency contact added",
      weight: 15,
      met: c.emergencyContactsCount > 0,
    },
    { key: "card", label: "Card active", weight: 15, met: c.cardStatus === "ACTIVE" },
  ];
}

export function readinessForCustomer(c: Customer): ReadinessResult {
  return computeReadiness(customerReadinessFactors(c));
}

/**
 * Protection Status — is the customer actually protected *now*?
 *   PROTECTED    active card + verified identity + emergency info in place
 *   UNPROTECTED  none of the protective essentials yet
 *   IN_PROGRESS  somewhere in between
 * Distinct from Readiness: a customer can be "Ready for Protection" yet not
 * PROTECTED until their card is active.
 */
/**
 * The three protective essentials, reduced to booleans. The single source of
 * the Protection Status decision — `protectionStatus` (Customer view) and the
 * Work Engine's boundary-crossing detection both route through here, so they can
 * never disagree on what "protected" means.
 */
export type ProtectionFacets = {
  identityVerified: boolean;
  cardActive: boolean;
  emergencyPresent: boolean;
};

export function protectionStatusFromFacets(f: ProtectionFacets): ProtectionStatus {
  if (f.cardActive && f.identityVerified && f.emergencyPresent) return "PROTECTED";
  if (!f.cardActive && !f.identityVerified && !f.emergencyPresent) {
    return "UNPROTECTED";
  }
  return "IN_PROGRESS";
}

export function protectionStatus(c: Customer): ProtectionStatus {
  return protectionStatusFromFacets({
    identityVerified: c.identityStatus === "VERIFIED",
    cardActive: c.cardStatus === "ACTIVE",
    emergencyPresent: c.emergencyInfoComplete,
  });
}

export type ProtectionStatusMeta = { label: string; tone: BadgeTone };

export const PROTECTION_STATUS_META: Record<
  ProtectionStatus,
  ProtectionStatusMeta
> = {
  PROTECTED: { label: "Protected", tone: "success" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  UNPROTECTED: { label: "Unprotected", tone: "danger" },
};
