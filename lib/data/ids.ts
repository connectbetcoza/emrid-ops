/** Server-side id/time helpers for repositories (not used in workflow scripts). */
export const nowIso = (): string => new Date().toISOString();
export const newAuditId = (): string => crypto.randomUUID();
