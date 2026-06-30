import Link from "next/link";
import { ArrowUpRight, HeartPulse, ShieldCheck, TrendingUp } from "lucide-react";
import { LinearProgress } from "@/components/ui/ProgressIndicator";
import { Eyebrow } from "@/components/ui/Typography";
import { runProtectedLivesEngine } from "@/lib/engines/protected-lives";
import { getAggregateRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Protected Lives — the visual focal point of Mission Control and the company's
 * north-star metric. Everything else on the page exists to explain why this
 * number is moving. Deliberately the largest, highest-contrast element on the
 * screen; fed by the Protected Lives Engine over the maintained aggregate
 * (repository-backed — an identity/card approval that crosses the Protected
 * boundary shifts this figure).
 */
export async function ProtectedLivesHero() {
  const aggregate = await getAggregateRepository().getProtectedLives();
  const { protected: protectedLives, total, weeklyDelta, direction } =
    runProtectedLivesEngine(aggregate);
  const inProgress = Math.max(0, total - protectedLives);
  const pct = total > 0 ? Math.round((protectedLives / total) * 100) : 0;
  const up = direction === "up";
  // Weekly trend is not tracked yet (no historical snapshots) — show the pill
  // only when there is a real movement to report, never a misleading "−0".
  const showTrend = weeklyDelta !== 0;

  return (
    <section
      aria-label="Protected Lives"
      className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      {/* Ambient accent wash — subtle, never noisy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HeartPulse className="h-4 w-4" aria-hidden />
            </span>
            <Eyebrow>Protected lives</Eyebrow>
          </div>

          <div className="flex items-end gap-3">
            <span className="text-6xl font-semibold leading-none tracking-tight text-foreground tabular-nums sm:text-7xl">
              {protectedLives.toLocaleString("en-ZA")}
            </span>
            {showTrend ? (
              <span
                className={cn(
                  "mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-medium",
                  up ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                )}
              >
                <TrendingUp
                  className={cn("h-4 w-4", !up && "rotate-180")}
                  aria-hidden
                />
                {up ? "+" : "−"}
                {Math.abs(weeklyDelta)} this week
              </span>
            ) : null}
          </div>

          <p className="max-w-md text-sm text-muted-foreground">
            EMRID is protecting more lives every week. Every action across
            operations moves a customer closer to protection.
          </p>
        </div>

        {/* Protection coverage */}
        <div className="w-full max-w-xs space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              Protection coverage
            </span>
            <span className="font-semibold text-foreground tabular-nums">
              {pct}%
            </span>
          </div>
          <LinearProgress value={pct} tone="success" label="Protection coverage" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground tabular-nums">
                {protectedLives.toLocaleString("en-ZA")}
              </span>{" "}
              protected
            </span>
            <Link
              href="/customer-readiness"
              className="group inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              <span className="tabular-nums">{inProgress.toLocaleString("en-ZA")}</span>{" "}
              in progress
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
