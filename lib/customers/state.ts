import "server-only";
import {
  getDeviceRepository,
  getDirectoryRepository,
  getEmergencyProfileRepository,
  getProfileRepository,
} from "@/lib/data";
import {
  customerFromState,
  entryToCustomer,
} from "@/lib/customers/directory-core";
import type { Customer } from "@/lib/customers/types";

/**
 * Repo-backed customer operational state — REAL DATA ONLY, no fixtures.
 *
 * `getCustomerState` (the Customer Workspace read) assembles the customer from
 * the source-of-truth repositories: Profile (identity + names), Device (card),
 * EmergencyProfile (emergency facets). Unknown to the ProfileRepository ⇒
 * genuinely not found. `getAllCustomerStates` (the Customers index and Mission
 * Control customer widgets) reads the producer-maintained Customer Directory —
 * a single-partition Query, never a scan, never a fixture.
 *
 * (Local dev unchanged: the mock ADAPTERS seed themselves from the dev
 * fixtures; this module no longer knows fixtures exist.)
 */
export async function getCustomerState(
  customerId: string,
): Promise<Customer | null> {
  const [profile, devices, emergency] = await Promise.all([
    getProfileRepository().getProfile(customerId),
    getDeviceRepository().listForCustomer(customerId),
    getEmergencyProfileRepository().getEmergencyProfile(customerId),
  ]);
  if (!profile) return null;
  return customerFromState({ profile, emergency, devices });
}

/** All customers' operational state, from the Customer Directory projection. */
export async function getAllCustomerStates(): Promise<Customer[]> {
  const entries = await getDirectoryRepository().listCustomers();
  return entries.map(entryToCustomer);
}
