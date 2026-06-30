import type { OpsRole } from "@/types";

/**
 * Operations role metadata.
 *
 * This is an EXHAUSTIVE `Record<OpsRole, RoleMeta>`: adding a role to the
 * `OpsRole` union forces a matching entry here (the compiler is the checklist).
 *
 * Sprint 1 deliberately models **identity only** — `label` + `description` for
 * display. There is intentionally NO permission/capability data: permission
 * enforcement is out of scope for this sprint (see the brief). When permissions
 * arrive, they extend `RoleMeta` here, and the exhaustiveness guarantee ensures
 * every role is considered.
 */
export type RoleMeta = {
  /** Canonical display label, e.g. "Operations Administrator". */
  label: string;
  /** One-line description of the role's remit, for admin/role pickers. */
  description: string;
};

export const ROLE_META: Record<OpsRole, RoleMeta> = {
  SUPER_ADMIN: {
    label: "Super Administrator",
    description:
      "Unrestricted platform access. Manages staff, roles, and configuration.",
  },
  OPERATIONS_ADMIN: {
    label: "Operations Administrator",
    description:
      "Runs day-to-day operations across all queues and oversees the team.",
  },
  CUSTOMER_SUPPORT: {
    label: "Customer Support",
    description: "Resolves customer queries and manages support work items.",
  },
  IDENTITY_OFFICER: {
    label: "Identity Officer",
    description: "Reviews and verifies customer identity submissions.",
  },
  FULFILMENT_OFFICER: {
    label: "Fulfilment Officer",
    description: "Encodes, dispatches, and activates EMRID cards.",
  },
  PRACTITIONER_MANAGER: {
    label: "Practitioner Manager",
    description: "Approves and manages practitioner accounts and practices.",
  },
  EXECUTIVE: {
    label: "Executive",
    description: "Read-only access to programme-level metrics and performance.",
  },
};

/** Every role, in display order (most-privileged first). */
export const OPS_ROLES: readonly OpsRole[] = [
  "SUPER_ADMIN",
  "OPERATIONS_ADMIN",
  "CUSTOMER_SUPPORT",
  "IDENTITY_OFFICER",
  "FULFILMENT_OFFICER",
  "PRACTITIONER_MANAGER",
  "EXECUTIVE",
];

export function roleMeta(role: OpsRole): RoleMeta {
  return ROLE_META[role];
}

/** Display label for a role, or a neutral fallback when a user has none. */
export function roleLabel(role: OpsRole | null): string {
  return role ? ROLE_META[role].label : "Operations";
}
