import "server-only";
import {
  getDeviceRepository,
  getEmergencyProfileRepository,
  getProfileRepository,
} from "@/lib/data";
import { MOCK_CUSTOMERS, getCustomer } from "@/lib/customers/mock";
import {
  emergencyContactCount,
  hasEmergencyInfo,
  isProfileComplete,
} from "@/lib/customers/facets";
import type { CardStatus, Customer, IdentityStatus } from "@/lib/customers/types";
import type { DeviceStatus, IdentityVerificationStatus } from "@/lib/data/entities";

/**
 * Repo-backed customer operational state.
 *
 * Identity (Profile), card (Device), and the emergency facets (EmergencyProfile)
 * are all sourced from repositories, so an Ops identity approval — or a customer
 * adding emergency info on the Patient Platform — is reflected everywhere
 * (workspace, readiness, Mission Control). Profile-completeness, emergency-info,
 * and emergency-contact are derived by the pure `facets` helpers; only the
 * static identifying details (email, mobile, location, joinedAt) remain fixture
 * input pending their own profile fields.
 */
const TO_IDENTITY_STATUS: Record<IdentityVerificationStatus, IdentityStatus> = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "UNVERIFIED",
};

/** Device status → the customer's card facet. REVOKED/REPLACED ⇒ no card. */
const TO_CARD_STATUS: Record<DeviceStatus, CardStatus> = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REVOKED: "NONE",
  REPLACED: "NONE",
};

export async function getCustomerState(
  customerId: string,
): Promise<Customer | null> {
  const fixture = getCustomer(customerId);
  if (!fixture) return null;

  const [profile, devices, emergency] = await Promise.all([
    getProfileRepository().getProfile(customerId),
    getDeviceRepository().listForCustomer(customerId),
    getEmergencyProfileRepository().getEmergencyProfile(customerId),
  ]);

  const identityStatus: IdentityStatus = profile?.identityVerificationStatus
    ? TO_IDENTITY_STATUS[profile.identityVerificationStatus]
    : fixture.identityStatus;

  // Card facet from the device repo: prefer an ACTIVE device, else the first.
  const device = devices.find((d) => d.status === "ACTIVE") ?? devices[0];
  const cardStatus: CardStatus = device
    ? TO_CARD_STATUS[device.status]
    : "NONE";

  // Readiness facets derived from repositories (fail back to fixture only when
  // a profile is entirely absent, which does not happen in mock).
  const profileComplete = profile
    ? isProfileComplete(profile)
    : fixture.profileComplete;

  // Repo identity + card + emergency override the fixture; only the static
  // identifying details (email/mobile/location/joinedAt) remain fixture input.
  return {
    ...fixture,
    profileComplete,
    identityStatus,
    emergencyInfoComplete: hasEmergencyInfo(emergency),
    emergencyContactsCount: emergencyContactCount(emergency),
    cardStatus,
  };
}

/** All customers' operational state (repo identity + fixture facets). */
export async function getAllCustomerStates(): Promise<Customer[]> {
  const states = await Promise.all(
    MOCK_CUSTOMERS.map((c) => getCustomerState(c.id)),
  );
  return states.filter((c): c is Customer => c !== null);
}
