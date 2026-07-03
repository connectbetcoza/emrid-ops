import type { PractitionerDirectoryEntry } from "@/lib/data/entities";

/**
 * Practitioner Management — pure core (validation + search). V1 policy:
 * ADMINISTRATION owns creation (internal onboarding, no public sign-up);
 * new accounts default to APPROVED ("Active").
 */
export type OnboardingInput = {
  fullName: string;
  email: string;
  registrationNumber?: string;
  /** Optional Cognito sub — when the login already exists. Generated otherwise. */
  cognitoUserId?: string;
  practiceName: string;
  practiceEmail: string;
  practicePhone?: string;
  practiceAddress?: string;
};

/** Returns a user-facing problem, or null when the input is acceptable. */
export function validateOnboarding(input: OnboardingInput): string | null {
  if (!input.fullName.trim()) return "The practitioner's full name is required.";
  if (!input.email.trim() || !input.email.includes("@")) {
    return "A valid practitioner email is required.";
  }
  if (!input.practiceName.trim()) return "The practice name is required.";
  if (!input.practiceEmail.trim() || !input.practiceEmail.includes("@")) {
    return "A valid practice email is required.";
  }
  return null;
}

/** Generated ids mark accounts whose Cognito login hasn't been linked yet. */
export function credentialsPending(practitionerId: string): boolean {
  return practitionerId.startsWith("prac_");
}

/** Case-insensitive search over name, email, practice, and id. */
export function searchPractitioners(
  entries: PractitionerDirectoryEntry[],
  query: string,
): PractitionerDirectoryEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return entries;
  return entries.filter((e) =>
    [e.fullName, e.email, e.practiceName ?? "", e.practitionerId]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
