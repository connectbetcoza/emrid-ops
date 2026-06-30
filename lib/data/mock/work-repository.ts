import type { WorkItemRecord } from "@/lib/data/work-record";
import type { WorkItemRepository, WorkTransitionInput } from "@/lib/data/types";
import type { WorkDomain } from "@/lib/work/work-type";
import { mockStore } from "@/lib/data/mock/store";
import { nowIso } from "@/lib/data/ids";

/**
 * In-memory WorkItemRepository. A single map keyed by workItemId is the source
 * of truth, so the two projections (by-domain and by-customer) are consistent
 * by construction — `transition` updates the one record and both reads reflect
 * it. (The DynamoDB impl models the two physical items + dual-write explicitly.)
 */
export class MockWorkItemRepository implements WorkItemRepository {
  async create(record: WorkItemRecord): Promise<WorkItemRecord> {
    // Idempotent on workItemId: a replay returns the EXISTING item rather than
    // overwriting any progress it has since made.
    const existing = mockStore.workItems.get(record.workItemId);
    if (existing) return { ...existing };
    mockStore.workItems.set(record.workItemId, { ...record });
    return { ...record };
  }

  async listByDomain(domain: WorkDomain): Promise<WorkItemRecord[]> {
    return [...mockStore.workItems.values()]
      .filter((w) => w.workDomain === domain)
      .map((w) => ({ ...w }));
  }

  async listForCustomer(customerId: string): Promise<WorkItemRecord[]> {
    return [...mockStore.workItems.values()]
      .filter((w) => w.customerId === customerId)
      .map((w) => ({ ...w }));
  }

  async transition(
    current: WorkItemRecord,
    input: WorkTransitionInput,
  ): Promise<WorkItemRecord> {
    const existing = mockStore.workItems.get(current.workItemId);
    if (!existing) throw new Error(`Work item not found: ${current.workItemId}`);
    const updated: WorkItemRecord = {
      ...existing,
      status: input.toStatus,
      step: input.step ?? existing.step,
      updatedAt: nowIso(),
    };
    mockStore.workItems.set(updated.workItemId, updated);
    return { ...updated };
  }
}
