/**
 * Ops-authored audit event types — first-class operational facts on the SHARED
 * audit trail (audit-vocabulary **Option A**). These are deliberately NOT mapped
 * onto approximate Patient event names: an Ops identity approval is recorded as
 * `IDENTITY_VERIFIED`, not squashed into a generic Patient event.
 *
 * ⚠️ Cross-product: the Patient Platform must add these strings to its
 * `AuditEventType` union and handle them safely in any timeline/label renderer
 * (see OPERATOR_HANDOFF §6b). Until both repos are aligned, do not connect AWS.
 *
 * Single source of truth: `transition-service` writes these; the shared-contract
 * test pins them. Adding an Ops event type means adding it here (and on the
 * Patient side), nowhere else.
 */
export const OPS_AUDIT_EVENT = {
  IDENTITY_VERIFIED: "IDENTITY_VERIFIED",
  IDENTITY_REJECTED: "IDENTITY_REJECTED",
  CARD_ACTIVATED: "CARD_ACTIVATED",
  WORK_TRANSITION: "OPS_WORK_TRANSITION",
  PRACTITIONER_APPROVED: "PRACTITIONER_APPROVED",
  PRACTITIONER_REJECTED: "PRACTITIONER_REJECTED",
  PRACTITIONER_ONBOARDED: "PRACTITIONER_ONBOARDED",
  PRACTITIONER_UPDATED: "PRACTITIONER_UPDATED",
} as const;

export type OpsAuditEventType =
  (typeof OPS_AUDIT_EVENT)[keyof typeof OPS_AUDIT_EVENT];
