import type { WorkItem, WorkAssignment } from "@/lib/work/types";
import type { WorkStatus } from "@/lib/work/status";
import { workTypeMeta, type WorkType } from "@/lib/work/work-type";
import { FACTOR_WORK_TYPE, dueDateFor, effectivePriority } from "@/lib/work/rules";
import {
  customerReadinessFactors,
  protectionStatus,
} from "@/lib/customers/readiness";
import type { Customer } from "@/lib/customers/types";

/**
 * Work generation — the Work Engine turning state into work. The Sprint-3 rule:
 * every outstanding readiness factor becomes a work item, typed and prioritised
 * by the rules, owned by the engine (not by any queue). Deterministic + mock.
 */

const BASE_CREATED = "2026-06-26T09:00:00.000Z";

/** Deterministic, illustrative assignment so queues show owned + unowned work. */
const TYPE_OWNER: Partial<Record<WorkType, string>> = {
  VERIFY_IDENTITY: "Lerato Nkosi",
  ISSUE_CARD: "Pieter van Wyk",
  APPROVE_PRACTITIONER: "Naledi Khumalo",
};

function assignment(type: WorkType, leaveOpen: boolean): WorkAssignment {
  if (leaveOpen) return { assigneeName: null };
  const name = TYPE_OWNER[type];
  return name
    ? { assigneeName: name, assignedAt: BASE_CREATED }
    : { assigneeName: null };
}

/** Status of generated work from the customer's current facet state. */
function statusFor(type: WorkType, customer: Customer): WorkStatus {
  if (type === "VERIFY_IDENTITY") {
    return customer.identityStatus === "PENDING" ? "IN_PROGRESS" : "OPEN";
  }
  if (type === "ISSUE_CARD") {
    if (customer.cardStatus === "PENDING") return "IN_PROGRESS";
    if (customer.cardStatus === "SUSPENDED") return "BLOCKED";
    return "OPEN";
  }
  return "OPEN";
}

/**
 * Initial step into the type's forward flow. A card already in fulfilment
 * (PENDING) has started encoding, so it resumes at step 1 (next: "Mark
 * encoded"). Everything else starts at step 0.
 */
function stepFor(type: WorkType, customer: Customer): number {
  if (type === "ISSUE_CARD" && customer.cardStatus === "PENDING") return 1;
  return 0;
}

/** Work items for one customer, from their unmet readiness factors. */
export function generateReadinessWork(customer: Customer): WorkItem[] {
  const unprotected = protectionStatus(customer) === "UNPROTECTED";

  return customerReadinessFactors(customer)
    .filter((factor) => !factor.met)
    .map((factor, i) => {
      const type = FACTOR_WORK_TYPE[factor.key] ?? "COMPLETE_PROFILE";
      const meta = workTypeMeta(type);
      const priority = effectivePriority(meta.defaultPriority, { unprotected });
      return {
        id: `${customer.id}-${factor.key}`,
        type,
        domain: meta.domain,
        title: meta.label,
        subjectName: customer.fullName,
        customerId: customer.id,
        priority,
        status: statusFor(type, customer),
        assignment: assignment(type, i % 2 === 0),
        source: "READINESS_GAP",
        createdAt: BASE_CREATED,
        dueDate: dueDateFor(BASE_CREATED, priority),
        nextAction: meta.nextAction,
        step: stepFor(type, customer),
      } satisfies WorkItem;
    });
}

/** Work not derived from readiness — manual / system / customer-request. */
function manualWork(): WorkItem[] {
  const practitioner = workTypeMeta("APPROVE_PRACTITIONER");
  const support = workTypeMeta("RESOLVE_SUPPORT_QUERY");
  return [
    {
      id: "WK-PR-9001",
      type: "APPROVE_PRACTITIONER",
      domain: practitioner.domain,
      title: practitioner.label,
      subjectName: "Dr. Johan Botha",
      priority: "MEDIUM",
      status: "OPEN",
      assignment: { assigneeName: "Naledi Khumalo", assignedAt: BASE_CREATED },
      source: "MANUAL",
      createdAt: BASE_CREATED,
      dueDate: dueDateFor(BASE_CREATED, "MEDIUM"),
      nextAction: practitioner.nextAction,
    },
    {
      id: "WK-SU-9002",
      type: "RESOLVE_SUPPORT_QUERY",
      domain: support.domain,
      title: "Billing query — duplicate charge",
      subjectName: "Kabelo Sithole",
      customerId: "CUS-2048",
      priority: "MEDIUM",
      status: "WAITING",
      assignment: { assigneeName: "Lerato Nkosi", assignedAt: BASE_CREATED },
      source: "CUSTOMER_REQUEST",
      createdAt: BASE_CREATED,
      dueDate: dueDateFor(BASE_CREATED, "MEDIUM"),
      nextAction: "Confirm with finance",
    },
  ];
}

/** All work across the platform: readiness-generated + manual. */
export function generateAllWork(customers: Customer[]): WorkItem[] {
  return [...customers.flatMap(generateReadinessWork), ...manualWork()];
}
