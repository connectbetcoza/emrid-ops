import {
  protectionStatus,
  readinessForCustomer,
} from "@/lib/customers/readiness";
import type { Customer, ProtectionStatus } from "@/lib/customers/types";
import type { ReadinessResult } from "@/lib/readiness/core";

/**
 * Protection — the emerging top-level model.
 *
 * Architectural direction: Protection (not Identity, not Readiness) is the
 * organising concept. Readiness is **one component** of a customer's protection
 * state, alongside their live Protection Status today and (in future) device,
 * consent, and guardianship signals. This module is the first, deliberately
 * small step toward that model — it composes the existing pieces without
 * refactoring them. As new domains arrive, `ProtectionState` grows new
 * components here rather than spawning standalone concepts.
 *
 *   Mission Control → Protection Engine → Work Engine → Queue projections
 *                   → Customer Workspace → Protected Lives
 */
export type ProtectionState = {
  /** Whether the customer is protected right now. */
  status: ProtectionStatus;
  /** Readiness — one component of protection (how close to protected). */
  readiness: ReadinessResult;
  // Future components: device, consent, guardianship, …
};

export function protectionFor(customer: Customer): ProtectionState {
  return {
    status: protectionStatus(customer),
    readiness: readinessForCustomer(customer),
  };
}
