import type { EmergencyProfile, Profile } from "@/lib/data/entities";

/**
 * Pure derivations of a customer's readiness FACETS from shared-table entities.
 * No Next/AWS imports, so they are unit-tested directly (Rule 15). These replace
 * the former `MOCK_CUSTOMERS` fixture inputs for profile-completeness,
 * emergency-info, and emergency-contact: the values now flow from the Profile
 * and EmergencyProfile repositories. The readiness MATHS still lives in
 * `lib/readiness/core.ts`; this module only decides whether each factor is met.
 */

/**
 * The EmergencyProfile fields that count as "emergency medical info" — every
 * VisibleField except `emergencyContacts` (contacts are a SEPARATE readiness
 * factor) and the non-field keys (`profileId`, `updatedAt`).
 */
const MEDICAL_INFO_KEYS = [
  "bloodType",
  "allergies",
  "chronicConditions",
  "medications",
  "disabilities",
  "emergencyInstructions",
  "medicalAid",
  "preferredHospital",
  "familyDoctor",
] as const;

/** Profile basics present — the "Profile complete" factor (weight 15). */
export function isProfileComplete(profile: Profile): boolean {
  return Boolean(profile.firstName && profile.lastName && profile.dateOfBirth);
}

/** Emergency medical info present — the "Emergency info added" factor (weight 25). */
export function hasEmergencyInfo(emergency: EmergencyProfile | null): boolean {
  if (!emergency) return false;
  return MEDICAL_INFO_KEYS.some((key) => emergency[key] !== undefined);
}

/** Number of emergency contacts — backs the "Emergency contact added" factor. */
export function emergencyContactCount(
  emergency: EmergencyProfile | null,
): number {
  return emergency?.emergencyContacts?.value.length ?? 0;
}
