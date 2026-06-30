import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";
import { runBriefingEngine } from "@/lib/engines/briefing";

/**
 * The Morning Brief — the dashboard's greeting widget. Summarises yesterday's
 * throughput and today's priorities. Operational health lives in its own
 * dedicated widget (it is intentionally NOT duplicated here). Mock data only.
 */
export function MorningBrief({ greeting }: { greeting: string }) {
  const { yesterday, priorities } = runBriefingEngine();
  return (
    <Card className="overflow-hidden">
      <div className="space-y-1">
        <Eyebrow>Morning brief</Eyebrow>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {greeting}
        </h2>
        <p className="text-sm text-muted-foreground">
          Here’s where operations stand today.
        </p>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* Yesterday */}
        <section className="space-y-2.5">
          <Eyebrow>Yesterday</Eyebrow>
          <ul className="space-y-1.5">
            {yesterday.map((stat) => (
              <li key={stat.label} className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {stat.value}
                </span>{" "}
                {stat.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Today's priorities */}
        <section className="space-y-2.5">
          <Eyebrow>Today’s priorities</Eyebrow>
          <ul className="space-y-1">
            {priorities.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-xs font-semibold",
                      p.urgent
                        ? "bg-danger/10 text-danger"
                        : "bg-primary-muted text-primary",
                    )}
                  >
                    {p.value}
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      p.urgent ? "text-danger" : "text-muted-foreground",
                    )}
                  >
                    {p.label}
                  </span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}
