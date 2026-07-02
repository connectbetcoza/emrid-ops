import type { WorkOutput } from "@/lib/engines/types";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import { todaysWork } from "@/lib/work/projections";
import { WORK_DOMAINS } from "@/lib/work/work-type";

/**
 * Work Engine — Mission Control's "Today's Work" is a projection of the
 * PERSISTED Work Items (most pressing active work across every domain), read
 * through the flag-selected WorkItemRepository. The output contract is
 * unchanged; ranking can grow richer (or LLM-driven) behind it.
 */
export async function runWorkEngine(limit = 4): Promise<WorkOutput> {
  const perDomain = await Promise.all(
    WORK_DOMAINS.map((d) => getWorkItemRepository().listByDomain(d)),
  );
  return todaysWork(perDomain.flat().map(recordToWorkItem), limit);
}
