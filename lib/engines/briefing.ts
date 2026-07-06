import type { PriorityStat } from "@/lib/engines/types";
import type { WorkItem } from "@/lib/work/types";
import { isActiveWork } from "@/lib/work/types";
import {
  WORK_DOMAINS,
  WORK_DOMAIN_HREF,
  WORK_DOMAIN_LABEL,
} from "@/lib/work/work-type";

/**
 * Briefing Engine — today's priorities, derived from the LIVE work index (the
 * same items every queue projects). One row per domain with open work, urgent
 * when any item in the domain is URGENT. The previous deterministic-mock body
 * (fabricated throughput figures) was removed in the go-live hardening sprint:
 * Mission Control never fabricates. "Yesterday's throughput" needs a
 * time-indexed access pattern that doesn't exist yet, so it is omitted rather
 * than invented.
 */
export function briefingPriorities(items: WorkItem[]): PriorityStat[] {
  const active = items.filter(isActiveWork);
  return WORK_DOMAINS.flatMap((domain) => {
    const inDomain = active.filter((w) => w.domain === domain);
    if (inDomain.length === 0) return [];
    return [
      {
        label: `open in ${WORK_DOMAIN_LABEL[domain]}`,
        value: inDomain.length,
        href: WORK_DOMAIN_HREF[domain],
        urgent: inDomain.some((w) => w.priority === "URGENT"),
      },
    ];
  });
}
