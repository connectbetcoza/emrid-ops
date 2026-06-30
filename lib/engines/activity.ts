import { BadgeCheck, CreditCard, Stethoscope, UserPlus } from "lucide-react";
import type { ActivityOutput } from "@/lib/engines/types";

/**
 * Activity Engine — produces the recent operational activity feed.
 * Deterministic mock in Sprint 2; later sourced from the audit timeline behind
 * the same contract.
 */
export function runActivityEngine(): ActivityOutput {
  return [
    {
      id: "a1",
      time: "9m ago",
      title: "Identity verified",
      description: "Lerato Nkosi approved Thandi Mokoena's identity.",
      icon: BadgeCheck,
    },
    {
      id: "a2",
      time: "24m ago",
      title: "Card encoded",
      description: "Pieter van Wyk encoded a card for Sipho Dlamini.",
      icon: CreditCard,
    },
    {
      id: "a3",
      time: "1h ago",
      title: "Practitioner approved",
      description: "Dr. Lindiwe Cele approved by Naledi Khumalo.",
      icon: Stethoscope,
    },
    {
      id: "a4",
      time: "2h ago",
      title: "Customer onboarded",
      description: "Themba Ndlovu claimed their account.",
      icon: UserPlus,
    },
  ];
}
