import type { ProtectedLivesAggregate } from "@/lib/data/entities";
import type {
  AggregateRepository,
  ProtectedLivesDelta,
} from "@/lib/data/types";
import { mockStore } from "@/lib/data/mock/store";
import { nowIso } from "@/lib/data/ids";

/** In-memory AggregateRepository over the shared mock store. */
export class MockAggregateRepository implements AggregateRepository {
  async getProtectedLives(): Promise<ProtectedLivesAggregate> {
    return { ...mockStore.protectedLives };
  }

  async adjustProtectedLives(
    delta: ProtectedLivesDelta,
  ): Promise<ProtectedLivesAggregate> {
    const a = mockStore.protectedLives;
    a.protectedCount = Math.max(0, a.protectedCount + delta.protected);
    a.inProgressCount = Math.max(0, a.inProgressCount + delta.inProgress);
    a.version += 1;
    a.lastUpdatedAt = nowIso();
    return { ...a };
  }
}
