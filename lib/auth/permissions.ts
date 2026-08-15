import type { OpsRole, OpsUser } from "@/types";
import type { WorkDomain } from "@/lib/work/work-type";

/**
 * Per-action authorization core (pure — the ONLY place role→capability
 * decisions live; no direct role comparisons anywhere else). Server-side
 * enforcement is authoritative; UI gating consumes the same functions and is
 * convenience only.
 *
 * Invariants (pinned by tests):
 *  - SUPER_ADMIN is EXPLICITLY present in every row — no hidden wildcard.
 *  - EXECUTIVE holds zero mutating permissions (read-only everywhere).
 *  - Multi-role users receive the union of their roles' permissions.
 *  - Empty/unknown role sets fail closed.
 */

export type Permission =
  | "DECIDE_IDENTITY"
  | "PROCESS_FULFILMENT"
  | "TRANSITION_READINESS_WORK"
  | "RESOLVE_SUPPORT"
  | "MANAGE_PRACTITIONERS"
  | "ADD_NOTES"
  | "CORRECT_CONTACT_DETAILS"
  | "ASSIST_DEVICES" // capability definition only — device mutations are a later slice
  | "REVOKE_DEVICES" // capability definition only — destructive tier
  | "VIEW_ADMINISTRATION";

export const PERMISSION_ROLES: Record<Permission, readonly OpsRole[]> = {
  DECIDE_IDENTITY: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "IDENTITY_OFFICER"],
  PROCESS_FULFILMENT: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "FULFILMENT_OFFICER"],
  TRANSITION_READINESS_WORK: [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
    "CUSTOMER_SUPPORT",
  ],
  RESOLVE_SUPPORT: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
  MANAGE_PRACTITIONERS: [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
    "PRACTITIONER_MANAGER",
  ],
  ADD_NOTES: [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
    "CUSTOMER_SUPPORT",
    "IDENTITY_OFFICER",
    "FULFILMENT_OFFICER",
    "PRACTITIONER_MANAGER",
  ],
  CORRECT_CONTACT_DETAILS: [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
    "CUSTOMER_SUPPORT",
  ],
  ASSIST_DEVICES: ["SUPER_ADMIN", "OPERATIONS_ADMIN", "CUSTOMER_SUPPORT"],
  REVOKE_DEVICES: ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
  VIEW_ADMINISTRATION: ["SUPER_ADMIN", "OPERATIONS_ADMIN"],
};

/** Union semantics: any held role granting the permission suffices. */
export function hasPermission(
  user: Pick<OpsUser, "roles">,
  permission: Permission,
): boolean {
  const allowed = PERMISSION_ROLES[permission];
  return user.roles.some((role) => allowed.includes(role));
}

/**
 * Which permission a work transition in a domain requires. Exhaustive — a new
 * domain forces an authorization decision at compile time. The domain is
 * always derived server-side from the item's TYPE (WORK_TYPE_META), never
 * from a client-supplied domain string.
 */
export const WORK_DOMAIN_PERMISSION: Record<WorkDomain, Permission> = {
  IDENTITY: "DECIDE_IDENTITY",
  FULFILMENT: "PROCESS_FULFILMENT",
  READINESS: "TRANSITION_READINESS_WORK",
  PRACTITIONER: "MANAGE_PRACTITIONERS",
  SUPPORT: "RESOLVE_SUPPORT",
};

export const PERMISSION_DENIED_MESSAGE =
  "You don't have permission for this action — contact an administrator.";

/** Calm, fail-closed enforcement helper: null when permitted, else the denial
 * message the action returns verbatim. */
export function ensurePermission(
  user: Pick<OpsUser, "roles">,
  permission: Permission,
): string | null {
  return hasPermission(user, permission) ? null : PERMISSION_DENIED_MESSAGE;
}
