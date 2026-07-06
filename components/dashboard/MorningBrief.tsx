import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Typography";
import { cn } from "@/lib/utils";
import { briefingPriorities } from "@/lib/engines/briefing";
import { getWorkItemRepository } from "@/lib/data";
import { recordToWorkItem } from "@/lib/work/record";
import { WORK_DOMAINS } from "@/lib/work/work-type";

/**
 * The Morning Brief — the dashboard's greeting widget. Today's priorities are
 * derived from the LIVE work index (the same persisted items every queue
 * projects); nothing here is fabricated. Rows link into the owning queue.
 */
export async function MorningBrief({ greeting }: { greeting: string }) {
  const perDomain = await Promise.all(
    WORK_DOMAINS.map((d) => getWorkItemRepository().listByDomain(d)),
  );
  const priorities = briefingPriorities(perDomain.flat().map(recordToWorkItem));

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

      <section className="mt-6 space-y-2.5">
        <Eyebrow>Today’s priorities</Eyebrow>
        {priorities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open work in any queue — operations are clear.
          </p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
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
        )}
      </section>
    </Card>
  );
}
