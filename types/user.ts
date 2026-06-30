/** ISO-8601 timestamp string, e.g. "2026-06-29T08:30:00.000Z". */
export type ISODateString = string;

export type OpsUserStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

/**
 * Operations staff roles. Sprint 1 establishes the role *vocabulary* only —
 * permission enforcement is deliberately out of scope (see the sprint brief).
 * Stage 3 attaches display metadata via an exhaustive `Record<OpsRole, …>`.
 */
export type OpsRole =
  | "SUPER_ADMIN"
  | "OPERATIONS_ADMIN"
  | "CUSTOMER_SUPPORT"
  | "IDENTITY_OFFICER"
  | "FULFILMENT_OFFICER"
  | "PRACTITIONER_MANAGER"
  | "EXECUTIVE";

/**
 * An Operations staff login account. Distinct from a patient `User` in the
 * Patient Platform — Ops users are internal staff. A user may hold several
 * roles; `roles[0]` is treated as the primary for display until permission
 * resolution exists.
 */
export type OpsUser = {
  userId: string;
  cognitoSub?: string;
  email: string;
  fullName: string;
  roles: OpsRole[];
  status: OpsUserStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

/** Convenience: the role used for display (primary role). */
export function primaryRole(user: Pick<OpsUser, "roles">): OpsRole | null {
  return user.roles[0] ?? null;
}

/** First name for greetings (e.g. the Morning Brief). Falls back gracefully. */
export function firstName(user: Pick<OpsUser, "fullName">): string {
  return user.fullName.trim().split(/\s+/)[0] ?? user.fullName;
}
