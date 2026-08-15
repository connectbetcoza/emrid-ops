import type {
  AuditRepository,
  NoteRepository,
  ProfileRepository,
  UpdateContactDetailsInput,
} from "@/lib/data/types";
import { buildOpsNote } from "@/lib/notes/core";
import { OPS_AUDIT_EVENT } from "@/lib/work/audit";

/**
 * CMS Stage 1 — support contact corrections (pure core + injectable
 * orchestrator, the established `executeTransition` idiom). Contact fields are
 * display data DECOUPLED from the Cognito login; this flow can never touch
 * authentication, names, DOB, identity, or medical data — the repository input
 * type makes those unrepresentable.
 *
 * Verification is a MUTATION-LEVEL declaration (method + reason), recorded in
 * the audit metadata and the support note — no persistent session state.
 * Audit metadata and notes carry field NAMES only, never old/new values.
 */

export const VERIFICATION_METHODS = [
  "PHONE_CALLBACK",
  "EMRID_DOB_CHALLENGE",
  "EMAIL_THREAD",
  "IN_PERSON",
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  PHONE_CALLBACK: "Phone callback to the number on file",
  EMRID_DOB_CHALLENGE: "EMRID + date-of-birth challenge",
  EMAIL_THREAD: "Verified email thread",
  IN_PERSON: "In person",
};

export type ContactCorrectionInput = {
  contactEmail?: string;
  contactMobile?: string;
  verifiedVia: string;
  reason: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[0-9 ()-]{7,20}$/;

/** Returns a user-facing problem, or null when the correction is acceptable. */
export function validateContactCorrection(
  input: ContactCorrectionInput,
): string | null {
  const email = input.contactEmail?.trim();
  const mobile = input.contactMobile?.trim();
  if (!email && !mobile) {
    return "Provide the corrected email and/or mobile number.";
  }
  if (email && !EMAIL_RE.test(email)) return "Enter a valid email address.";
  if (mobile && !MOBILE_RE.test(mobile)) return "Enter a valid mobile number.";
  if (!VERIFICATION_METHODS.includes(input.verifiedVia as VerificationMethod)) {
    return "Select how the customer was verified.";
  }
  if (!input.reason.trim()) return "A reason for the correction is required.";
  if (input.reason.trim().length > 500) {
    return "Keep the reason under 500 characters.";
  }
  return null;
}

/** The field names being corrected — the ONLY change detail that is recorded. */
export function correctedFields(
  input: ContactCorrectionInput,
): ("contactEmail" | "contactMobile")[] {
  const fields: ("contactEmail" | "contactMobile")[] = [];
  if (input.contactEmail?.trim()) fields.push("contactEmail");
  if (input.contactMobile?.trim()) fields.push("contactMobile");
  return fields;
}

const FIELD_LABEL: Record<"contactEmail" | "contactMobile", string> = {
  contactEmail: "contact email",
  contactMobile: "contact mobile",
};

/** Note body: fields + method + operator reason. NEVER the old/new values. */
export function correctionNoteBody(input: ContactCorrectionInput): string {
  const fields = correctedFields(input)
    .map((f) => FIELD_LABEL[f])
    .join(" and ");
  const method =
    VERIFICATION_METHOD_LABEL[input.verifiedVia as VerificationMethod] ??
    input.verifiedVia;
  return `Contact correction (${fields}) — customer verified via: ${method}. Reason: ${input.reason.trim()}`;
}

export type ContactCorrectionDeps = {
  profileRepo: Pick<ProfileRepository, "getProfile" | "updateContactDetails">;
  auditRepo: Pick<AuditRepository, "record">;
  noteRepo: Pick<NoteRepository, "add">;
};

export type ContactCorrectionResult =
  | { ok: true; fields: string[] }
  | { ok: false; error: string };

/** Testable orchestrator: validate → fail-closed existence → whitelisted
 * write → PROFILE_UPDATED audit (fields + method only) → support note. */
export async function executeContactCorrection(
  deps: ContactCorrectionDeps,
  request: {
    profileId: string;
    input: ContactCorrectionInput;
    actor: { userId: string; fullName: string };
    noteId: string;
    workItemId?: string;
    now: string;
  },
): Promise<ContactCorrectionResult> {
  const problem = validateContactCorrection(request.input);
  if (problem) return { ok: false, error: problem };

  const profile = await deps.profileRepo.getProfile(request.profileId);
  if (!profile) return { ok: false, error: "Customer not found." };

  const update: UpdateContactDetailsInput = {};
  if (request.input.contactEmail?.trim()) {
    update.contactEmail = request.input.contactEmail.trim();
  }
  if (request.input.contactMobile?.trim()) {
    update.contactMobile = request.input.contactMobile.trim();
  }
  await deps.profileRepo.updateContactDetails(request.profileId, update);

  const fields = correctedFields(request.input);
  await deps.auditRepo.record({
    eventType: OPS_AUDIT_EVENT.PROFILE_UPDATED,
    actorType: "OPS",
    actorId: request.actor.userId,
    targetType: "PROFILE",
    targetId: request.profileId,
    metadata: {
      fields,
      verifiedVia: request.input.verifiedVia,
      ...(request.workItemId ? { workItemId: request.workItemId } : {}),
    },
  });

  await deps.noteRepo.add(
    buildOpsNote({
      noteId: request.noteId,
      subjectId: request.profileId,
      authorId: request.actor.userId,
      authorName: request.actor.fullName,
      body: correctionNoteBody(request.input),
      now: request.now,
    }),
  );

  return { ok: true, fields };
}
