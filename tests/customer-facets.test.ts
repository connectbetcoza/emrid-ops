import { describe, it, expect } from "vitest";
import {
  emergencyContactCount,
  hasEmergencyInfo,
  isProfileComplete,
} from "@/lib/customers/facets";
import type { EmergencyProfile, Profile } from "@/lib/data/entities";

function profile(over: Partial<Profile> = {}): Profile {
  return {
    profileId: "p1",
    emrid: "EMR-1",
    firstName: "Thandi",
    lastName: "Mokoena",
    dateOfBirth: "1990-01-01",
    status: "ACTIVE",
    verificationLevel: "UNVERIFIED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("isProfileComplete", () => {
  it("is true when the basics are present", () => {
    expect(isProfileComplete(profile())).toBe(true);
  });

  it("is false when a basic (date of birth) is missing", () => {
    expect(isProfileComplete(profile({ dateOfBirth: "" }))).toBe(false);
  });
});

describe("hasEmergencyInfo", () => {
  it("is false for a null emergency profile", () => {
    expect(hasEmergencyInfo(null)).toBe(false);
  });

  it("is false when only contacts are present (contacts are a separate factor)", () => {
    const e: EmergencyProfile = {
      profileId: "p1",
      emergencyContacts: {
        value: [{ name: "Jane", phone: "+27800000001" }],
        visibility: "PUBLIC_EMERGENCY",
      },
      updatedAt: "2026-06-28T08:00:00.000Z",
    };
    expect(hasEmergencyInfo(e)).toBe(false);
    expect(emergencyContactCount(e)).toBe(1);
  });

  it("is true when any medical field is present", () => {
    const e: EmergencyProfile = {
      profileId: "p1",
      bloodType: { value: "O+", visibility: "PUBLIC_EMERGENCY" },
      updatedAt: "2026-06-28T08:00:00.000Z",
    };
    expect(hasEmergencyInfo(e)).toBe(true);
  });
});

describe("emergencyContactCount", () => {
  it("is 0 for null or no contacts", () => {
    expect(emergencyContactCount(null)).toBe(0);
    expect(
      emergencyContactCount({ profileId: "p1", updatedAt: "x" }),
    ).toBe(0);
  });
});
