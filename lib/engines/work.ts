import type { WorkOutput } from "@/lib/engines/types";
import { MOCK_WORK_ITEMS } from "@/lib/work/mock";
import { todaysWork } from "@/lib/work/projections";

/**
 * Work Engine — Mission Control's "Today's Work" is a projection of the Work
 * Engine's items (most pressing active work), not a separate list. Deterministic
 * in Sprint 3; ranking can grow richer (or LLM-driven) behind this contract.
 */
export function runWorkEngine(limit = 4): WorkOutput {
  return todaysWork(MOCK_WORK_ITEMS, limit);
}
