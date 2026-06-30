import type { ProtectedLivesAggregate } from "@/lib/data/entities";
import type { ProtectedLives } from "@/lib/engines/types";

/**
 * Protected Lives Engine — produces the company's north-star figure: how many
 * lives are actively protected (a customer with an active EMRID card and the
 * critical emergency information in place).
 *
 * Now repository-backed: it is a pure mapping from the maintained
 * `ProtectedLivesAggregate` (read by the server component) onto the hero's
 * output contract. The data source changed; the output shape Mission Control
 * renders did not. `weeklyDelta`/`direction` are not yet tracked (no historical
 * snapshots), so they are reported honestly as zero/flat rather than fabricated
 * — a follow-up slice can add a weekly snapshot without touching the hero.
 */
export function runProtectedLivesEngine(
  aggregate: ProtectedLivesAggregate | null,
): ProtectedLives {
  const protectedCount = aggregate?.protectedCount ?? 0;
  const inProgress = aggregate?.inProgressCount ?? 0;
  return {
    protected: protectedCount,
    // "Coverage" denominator is protected + in-progress (customers actively on
    // the path); unprotected customers are not part of the coverage figure.
    total: protectedCount + inProgress,
    weeklyDelta: 0,
    direction: "flat",
  };
}
