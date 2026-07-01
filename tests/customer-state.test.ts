import { beforeEach, describe, it, expect } from "vitest";
import { getCustomerState } from "@/lib/customers/state";
import { getProfileRepository } from "@/lib/data";
import { mockStore, resetStore } from "@/lib/data/mock/store";
import { readinessForCustomer } from "@/lib/customers/readiness";
import type { Profile } from "@/lib/data/entities";

beforeEach(() => resetStore());

describe("getCustomerState (repo-backed identity, card + emergency facets)", () => {
  it("sources identity from the ProfileRepository and recomputes readiness on approval", async () => {
    const before = await getCustomerState("CUS-2041");
    expect(before?.identityStatus).toBe("PENDING");
    const r1 = readinessForCustomer(before!);
    expect(r1.score).toBe(55);
    expect(r1.band).toBe("NOT_READY");

    // Ops approves identity via the repository seam.
    await getProfileRepository().setIdentityDecision("CUS-2041", {
      decision: "VERIFIED",
      decidedByOpsUserId: "ops-1",
    });

    const after = await getCustomerState("CUS-2041");
    expect(after?.identityStatus).toBe("VERIFIED");
    const r2 = readinessForCustomer(after!);
    expect(r2.score).toBe(85); // +30 identity factor
    expect(r2.band).toBe("READY"); // crosses the Ready-for-Protection threshold
  });

  it("derives emergency facets from the EmergencyProfile repository", async () => {
    const c = await getCustomerState("CUS-2041");
    expect(c?.emergencyInfoComplete).toBe(true); // seeded blood type / allergies
    expect(c?.emergencyContactsCount).toBe(2); // seeded 2 contacts
    expect(c?.location).toBe("Johannesburg"); // static detail stays fixture
    expect(c?.cardStatus).toBe("NONE");
  });

  it("derives profile-completeness from the Profile (incomplete → factor unmet)", async () => {
    // CUS-2044 (Grace) is profile-incomplete and has no emergency data → 0.
    const c = await getCustomerState("CUS-2044");
    expect(c?.profileComplete).toBe(false);
    expect(c?.emergencyInfoComplete).toBe(false);
    expect(c?.emergencyContactsCount).toBe(0);
    expect(readinessForCustomer(c!).score).toBe(0);
  });

  it("recomputes readiness when emergency data appears in the repository", async () => {
    const before = readinessForCustomer((await getCustomerState("CUS-2044"))!);
    expect(before.score).toBe(0);

    // Simulate the customer adding emergency info + a contact on the Patient
    // Platform (a write to the shared EmergencyProfile item).
    mockStore.emergencyProfiles.set("CUS-2044", {
      profileId: "CUS-2044",
      bloodType: { value: "B+", visibility: "PUBLIC_EMERGENCY" },
      emergencyContacts: {
        value: [{ name: "Next of kin", phone: "+27800000009" }],
        visibility: "PUBLIC_EMERGENCY",
      },
      updatedAt: "2026-06-30T00:00:00.000Z",
    });

    const after = readinessForCustomer((await getCustomerState("CUS-2044"))!);
    expect(after.score).toBe(40); // +25 emergency info, +15 emergency contact
  });

  it("builds state from the Profile for a real (non-fixture) customer", async () => {
    // A production customer has no MOCK_CUSTOMERS entry — the Profile is the
    // source of truth. Gating on the fixture used to 404 every live customer.
    const live: Profile = {
      profileId: "profile_58af8916",
      emrid: "EMR-LIVE-1",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-01",
      status: "ACTIVE",
      verificationLevel: "UNVERIFIED",
      identityVerificationStatus: "PENDING",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    mockStore.profiles.set(live.profileId, live);

    const c = await getCustomerState("profile_58af8916");
    expect(c).not.toBeNull();
    expect(c?.id).toBe("profile_58af8916");
    expect(c?.fullName).toBe("John Doe");
    expect(c?.identityStatus).toBe("PENDING");
  });

  it("returns null only when unknown to both the repo and the fixture", async () => {
    expect(await getCustomerState("CUS-9999")).toBeNull();
  });
});
