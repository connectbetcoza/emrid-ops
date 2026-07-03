/** Server-side id/time helpers for repositories (not used in workflow scripts). */
export const nowIso = (): string => new Date().toISOString();
export const newAuditId = (): string => crypto.randomUUID();
export const newPractitionerId = (): string => `prac_${crypto.randomUUID()}`;
export const newPracticeId = (): string => `prc_${crypto.randomUUID()}`;
export const newNoteId = (): string => `note_${crypto.randomUUID()}`;
/** Subject-prefixed like producer ids, but unique per query (many per customer). */
export const newSupportQueryId = (customerId: string): string =>
  `${customerId}-support-${crypto.randomUUID()}`;
