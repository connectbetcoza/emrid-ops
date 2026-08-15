import type { OpsUser } from "@/types";
import { OPS_ROLES } from "@/lib/auth/roles";

/**
 * The demo Operations user used everywhere a real session will eventually be
 * resolved. Sprint 1 has no Cognito wiring, so the shell, header, and Morning
 * Brief read from this single source. Stage 3 formalises the auth architecture
 * (config flags + `requireOpsUser()` guard + provider) around this same shape;
 * the Cognito path replaces the body of `getMockOpsUser` without changing call
 * sites.
 */
export const MOCK_OPS_USER: OpsUser = {
  userId: "ops-mock-michael",
  email: "michael@emrid.co.za",
  fullName: "Michael Edwards",
  roles: ["OPERATIONS_ADMIN"],
  status: "ACTIVE",
  createdAt: "2026-01-05T08:00:00.000Z",
  updatedAt: "2026-06-29T08:00:00.000Z",
};

/**
 * Dev-only role override for per-role UI verification: `MOCK_OPS_ROLES` (comma
 * list of OpsRole values) reshapes the demo user. MOCK MODE ONLY by
 * construction — this module is never consulted when USE_MOCK_AUTH=false, and
 * production fails closed to real auth (lib/config).
 */
export function getMockOpsUser(): OpsUser {
  const override = process.env.MOCK_OPS_ROLES;
  if (!override) return MOCK_OPS_USER;
  const valid = new Set(OPS_ROLES);
  const roles = override
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is OpsUser["roles"][number] => valid.has(r as never));
  return roles.length > 0 ? { ...MOCK_OPS_USER, roles } : MOCK_OPS_USER;
}
