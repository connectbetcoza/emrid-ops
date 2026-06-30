import type { AlertOutput } from "@/lib/engines/types";

/**
 * Alert Engine — surfaces conditions that need operator attention, ranked by
 * severity. Deterministic mock in Sprint 2; a later sprint evaluates live
 * thresholds/anomalies behind the same contract.
 */
export function runAlertEngine(): AlertOutput {
  return [
    {
      id: "al1",
      severity: "critical",
      title: "1 customer currently unprotected",
      description: "Grace Mahlangu has no active card. Expedite fulfilment.",
    },
    {
      id: "al2",
      severity: "warning",
      title: "Support response above target",
      description: "Average first response is 4h 12m against a 3h target.",
    },
    {
      id: "al3",
      severity: "info",
      title: "Weekly fulfilment batch ready",
      description: "32 cards are queued for the Thursday courier pickup.",
    },
  ];
}
