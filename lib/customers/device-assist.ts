import type {
  AuditRepository,
  DeviceRepository,
  NoteRepository,
} from "@/lib/data/types";
import type { OpsRole } from "@/types";
import { buildOpsNote } from "@/lib/notes/core";
import { ensurePermission, type Permission } from "@/lib/auth/permissions";
import {
  VERIFICATION_METHODS,
  VERIFICATION_METHOD_LABEL,
  type VerificationMethod,
} from "@/lib/customers/contact-correction";

/**
 * Assisted device support (CMS Stage 2a) — pure core + injectable
 * orchestrator. The journey: lost/possibly-recoverable → SUSPEND; found →
 * REACTIVATE; confirmed lost/compromised → REVOKE; replacement → REVOKE +
 * fresh PENDING device (the stream producer then raises ISSUE_CARD work and
 * the normal fulfilment flow takes over).
 *
 * INVARIANTS: these orchestrators mutate the device and write audit/notes
 * ONLY — they NEVER touch the Protected Lives aggregate (the stream producer
 * owns every device-driven crossing, both directions — 2b model). Audit
 * metadata and notes carry ids + verification method only: never tokens,
 * never activation codes.
 */

export type DeviceAssistAction =
  | "SUSPEND"
  | "REACTIVATE"
  | "REVOKE"
  | "REPLACE";

/** REVOKE and REPLACE are destructive-tier; SUSPEND/REACTIVATE are assistive. */
export const DEVICE_ACTION_PERMISSION: Record<DeviceAssistAction, Permission> = {
  SUSPEND: "ASSIST_DEVICES",
  REACTIVATE: "ASSIST_DEVICES",
  REVOKE: "REVOKE_DEVICES",
  REPLACE: "REVOKE_DEVICES",
};

const ACTION_AUDIT_EVENT: Record<
  Exclude<DeviceAssistAction, "REPLACE">,
  string
> = {
  SUSPEND: "DEVICE_SUSPENDED",
  REACTIVATE: "DEVICE_REACTIVATED",
  REVOKE: "DEVICE_REVOKED",
};

const ACTION_NOTE_LABEL: Record<DeviceAssistAction, string> = {
  SUSPEND: "Device suspended (lost / possibly recoverable)",
  REACTIVATE: "Device reactivated (found again)",
  REVOKE: "Device revoked (confirmed lost / compromised)",
  REPLACE: "Device revoked and replacement issued",
};

export type DeviceAssistInput = {
  action: DeviceAssistAction;
  deviceId: string;
  verifiedVia: string;
  reason: string;
};

/** Returns a user-facing problem, or null when acceptable. */
export function validateDeviceAssist(input: DeviceAssistInput): string | null {
  if (!input.deviceId.trim()) return "Select the device.";
  if (!VERIFICATION_METHODS.includes(input.verifiedVia as VerificationMethod)) {
    return "Select how the customer was verified.";
  }
  if (!input.reason.trim()) return "A reason is required.";
  if (input.reason.trim().length > 500) {
    return "Keep the reason under 500 characters.";
  }
  return null;
}

/** Note body: action + method + reason. Never tokens or activation codes. */
export function deviceAssistNoteBody(input: DeviceAssistInput): string {
  const method =
    VERIFICATION_METHOD_LABEL[input.verifiedVia as VerificationMethod] ??
    input.verifiedVia;
  return `${ACTION_NOTE_LABEL[input.action]} — customer verified via: ${method}. Reason: ${input.reason.trim()}`;
}

export type DeviceAssistDeps = {
  deviceRepo: Pick<
    DeviceRepository,
    "suspendDevice" | "reactivateDevice" | "revokeDevice" | "issueReplacementDevice"
  >;
  auditRepo: Pick<AuditRepository, "record">;
  noteRepo: Pick<NoteRepository, "add">;
};

export type DeviceAssistResult =
  | { ok: true; action: DeviceAssistAction; replacementDeviceId?: string }
  | { ok: false; error: string; denied?: true };

export async function executeDeviceAssist(
  deps: DeviceAssistDeps,
  request: {
    customerId: string;
    input: DeviceAssistInput;
    actor: { userId: string; fullName: string; roles: readonly OpsRole[] };
    noteId: string;
    now: string;
  },
): Promise<DeviceAssistResult> {
  // Authorization FIRST (authoritative; per-action tier).
  const denied = ensurePermission(
    { roles: [...request.actor.roles] },
    DEVICE_ACTION_PERMISSION[request.input.action],
  );
  if (denied) return { ok: false, error: denied, denied: true };

  const problem = validateDeviceAssist(request.input);
  if (problem) return { ok: false, error: problem };

  const { customerId, input, actor } = request;
  let replacementDeviceId: string | undefined;

  try {
    if (input.action === "SUSPEND") {
      await deps.deviceRepo.suspendDevice(customerId, input.deviceId);
    } else if (input.action === "REACTIVATE") {
      await deps.deviceRepo.reactivateDevice(customerId, input.deviceId);
    } else {
      // REVOKE and REPLACE both revoke the target device first.
      await deps.deviceRepo.revokeDevice(customerId, input.deviceId);
    }
  } catch (error) {
    // Illegal transition / racing self-service — honest, fail-closed message.
    return {
      ok: false,
      error:
        error instanceof Error && error.message.includes("—")
          ? error.message
          : "Couldn't update the device — its state may have just changed.",
    };
  }

  // Audit the device action (existing shared vocabulary, OPS actor, ids only).
  const eventType =
    input.action === "REPLACE"
      ? ACTION_AUDIT_EVENT.REVOKE
      : ACTION_AUDIT_EVENT[input.action];
  await deps.auditRepo.record({
    eventType,
    actorType: "OPS",
    actorId: actor.userId,
    targetType: "DEVICE",
    targetId: input.deviceId,
    metadata: {
      profileId: customerId,
      verifiedVia: input.verifiedVia,
    },
  });

  if (input.action === "REPLACE") {
    const replacement = await deps.deviceRepo.issueReplacementDevice(customerId);
    replacementDeviceId = replacement.deviceId;
    // The issuance is a system-visible fact; CARD_REQUESTED already exists in
    // the shared vocabulary. Linkage via ids only — never the token/code.
    await deps.auditRepo.record({
      eventType: "CARD_REQUESTED",
      actorType: "OPS",
      actorId: actor.userId,
      targetType: "DEVICE",
      targetId: replacement.deviceId,
      metadata: {
        profileId: customerId,
        replacesDeviceId: input.deviceId,
        verifiedVia: input.verifiedVia,
      },
    });
  }

  await deps.noteRepo.add(
    buildOpsNote({
      noteId: request.noteId,
      subjectId: customerId,
      authorId: actor.userId,
      authorName: actor.fullName,
      body: deviceAssistNoteBody(input),
      now: request.now,
    }),
  );

  return { ok: true, action: input.action, replacementDeviceId };
}
