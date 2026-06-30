/**
 * Where a work item came from. The Work Engine generates most Sprint-3 work
 * from readiness gaps; others are manual or system-originated. Surfaced on the
 * work item so operators can see why a piece of work exists.
 */
export type WorkSource =
  | "READINESS_GAP"
  | "MANUAL"
  | "SYSTEM"
  | "CUSTOMER_REQUEST";

export const WORK_SOURCE_LABEL: Record<WorkSource, string> = {
  READINESS_GAP: "Readiness gap",
  MANUAL: "Created manually",
  SYSTEM: "System",
  CUSTOMER_REQUEST: "Customer request",
};

export function workSourceLabel(source: WorkSource): string {
  return WORK_SOURCE_LABEL[source];
}
