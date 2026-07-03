/** Server-side id/time helpers for repositories (not used in workflow scripts). */
export const nowIso = (): string => new Date().toISOString();
export const newAuditId = (): string => crypto.randomUUID();
export const newPractitionerId = (): string => `prac_${crypto.randomUUID()}`;
export const newPracticeId = (): string => `prc_${crypto.randomUUID()}`;
