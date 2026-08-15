/**
 * Device token + activation-code generation — BYTE-COMPATIBLE MIRROR of the
 * Patient Platform's `lib/devices/token.ts` (shared-format contract, pinned by
 * test). Used ONLY for Ops-issued replacement devices; tokens are opaque
 * bearer values (~140 bits, CSPRNG, no modulo bias — 256 % 32 === 0) and the
 * activation code is the customer's activation challenge (~60 bits).
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I,L,O,U)

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Opaque device token, e.g. "dvtk_J7K2...". 28 chars of entropy. */
export function generateDeviceToken(): string {
  return `dvtk_${randomString(28)}`;
}

/** Human-typable activation code, e.g. "J7K2-9QXB". */
export function generateActivationCode(): string {
  return `${randomString(4)}-${randomString(4)}`;
}
