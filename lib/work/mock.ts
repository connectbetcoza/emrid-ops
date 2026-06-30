import { MOCK_CUSTOMERS } from "@/lib/customers/mock";
import { generateAllWork } from "@/lib/work/generate";
import type { WorkItem } from "@/lib/work/types";

/**
 * The mock Work Engine store: all work items, generated from the mock customers'
 * readiness gaps plus a few manual items. This is the single source of work —
 * Mission Control, the Customer Workspace, and every queue read projections of
 * it (see `lib/work/projections`). Replaced by a repository later.
 */
export const MOCK_WORK_ITEMS: WorkItem[] = generateAllWork(MOCK_CUSTOMERS);

export function getWorkItem(id: string): WorkItem | undefined {
  return MOCK_WORK_ITEMS.find((w) => w.id === id);
}
