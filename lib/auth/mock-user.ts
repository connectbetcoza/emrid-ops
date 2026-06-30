import type { OpsUser } from "@/types";

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

export function getMockOpsUser(): OpsUser {
  return MOCK_OPS_USER;
}
