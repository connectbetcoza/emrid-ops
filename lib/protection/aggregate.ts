import type { ProtectionStatus } from "@/lib/customers/types";
import type { ProtectedLivesDelta } from "@/lib/data/types";

/**
 * Pure mapping from a protection-status transition to the signed change in the
 * maintained Protected-Lives counters. No Next/AWS imports, so it is unit-tested
 * directly. The rule (per the slice brief): **only a Protected-boundary crossing
 * moves the counters** — every other status change returns a zero delta.
 *
 * A customer reaching PROTECTED comes from IN_PROGRESS (the adjacent state on the
 * happy path), and losing protection returns there — so the inverse `inProgress`
 * move keeps protected + in-progress internally consistent for boundary crossings.
 */
export const NO_PROTECTION_CHANGE: ProtectedLivesDelta = {
  protected: 0,
  inProgress: 0,
};

export function protectedLivesDelta(
  before: ProtectionStatus,
  after: ProtectionStatus,
): ProtectedLivesDelta {
  if (before === after) return NO_PROTECTION_CHANGE;
  if (after === "PROTECTED") return { protected: 1, inProgress: -1 };
  if (before === "PROTECTED") return { protected: -1, inProgress: 1 };
  return NO_PROTECTION_CHANGE; // a move not touching the Protected boundary
}

export function crossesProtectedBoundary(delta: ProtectedLivesDelta): boolean {
  return delta.protected !== 0;
}
