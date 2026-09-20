import {
  isPhysicalDevice,
  type AuditEvent,
  type Device,
  type DeviceStatus,
} from "@/lib/data/entities";

/**
 * Card Fulfilment Pack — pure derivation of everything a fulfilment officer
 * needs to encode and verify a physical card (Rule 15: branching logic in a
 * tested pure core; the workspace section stays thin). Serialisable, so it
 * crosses the server→client boundary for the copy affordance.
 */
export type FulfilmentPack = {
  /** Human-readable EMRID code printed on the card. */
  emrid: string;
  deviceId: string;
  /** The opaque token — the ONLY thing encoded on the NFC chip. */
  token: string;
  /** Full public responder URL to encode: <patient origin>/e/<token>. */
  nfcUrl: string;
  /** Patient-issued activation code; null ⇒ "Not generated". */
  activationCode: string | null;
  status: DeviceStatus;
  /** Most recent tap observed for this device (test tap or responder view). */
  lastTapAt: string | null;
};

/**
 * Audit event types that evidence a physical tap of this device:
 *  - DEVICE_TAP_TESTED    — the Patient `/e` route, tapped while PENDING
 *    (the fulfilment tap-test seam).
 *  - EMERGENCY_PROFILE_VIEWED — a responder view of an ACTIVE device.
 * Contract with the Patient Platform's `/e/[deviceToken]` route.
 */
const TAP_EVENT_TYPES = new Set(["DEVICE_TAP_TESTED", "EMERGENCY_PROFILE_VIEWED"]);

/** The public responder URL for a token, on the PATIENT origin. */
export function nfcUrlFor(patientBaseUrl: string, token: string): string {
  return `${patientBaseUrl.replace(/\/+$/, "")}/e/${token}`;
}

/** Newest tap timestamp among the device's audit events, or null. */
export function lastTapAt(deviceEvents: AuditEvent[]): string | null {
  let latest: string | null = null;
  for (const event of deviceEvents) {
    if (!TAP_EVENT_TYPES.has(event.eventType)) continue;
    if (latest === null || event.timestamp > latest) latest = event.timestamp;
  }
  return latest;
}

export function buildFulfilmentPack(input: {
  emrid: string;
  device: Device;
  /** Audit events for target DEVICE#<deviceId> (any order). */
  deviceEvents: AuditEvent[];
  /** Patient Platform origin (config.patientAppUrl). */
  patientBaseUrl: string;
}): FulfilmentPack {
  return {
    emrid: input.emrid,
    deviceId: input.device.deviceId,
    token: input.device.token,
    nfcUrl: nfcUrlFor(input.patientBaseUrl, input.device.token),
    activationCode: input.device.activationCode ?? null,
    status: input.device.status,
    lastTapAt: lastTapAt(input.deviceEvents),
  };
}

/**
 * The device fulfilment concerns: the PENDING card being fulfilled first, else
 * an ACTIVE card (pack doubles as a reference), else whatever exists.
 *
 * WALLET_PASS devices are filtered out FIRST. A wallet pass has no chip to
 * encode and no activation code to print, so handing one to a fulfilment
 * officer as "the card" would give them a token to burn onto plastic that the
 * customer already carries digitally. A customer whose ONLY device is a wallet
 * pass has no card being fulfilled, and correctly gets no pack.
 */
export function fulfilmentDevice(devices: Device[]): Device | null {
  const physical = devices.filter(isPhysicalDevice);
  return (
    physical.find((d) => d.status === "PENDING") ??
    physical.find((d) => d.status === "ACTIVE") ??
    physical[0] ??
    null
  );
}
