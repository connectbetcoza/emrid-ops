import type { BriefingOutput } from "@/lib/engines/types";

/**
 * Briefing Engine — produces the Morning Brief: yesterday's throughput and
 * today's priorities. Deterministic mock in Sprint 2; LLM-swappable later
 * (e.g. a natural-language brief) behind the same output contract.
 */
export function runBriefingEngine(): BriefingOutput {
  return {
    yesterday: [
      { label: "customers registered", value: 18 },
      { label: "identities verified", value: 14 },
      { label: "cards activated", value: 9 },
    ],
    priorities: [
      {
        label: "identities awaiting review",
        value: 6,
        href: "/identity-verification",
      },
      { label: "cards to encode", value: 4, href: "/card-fulfilment" },
      { label: "practitioner approvals", value: 2, href: "/practitioners" },
      {
        label: "customer currently unprotected",
        value: 1,
        href: "/customer-readiness",
        urgent: true,
      },
    ],
  };
}
