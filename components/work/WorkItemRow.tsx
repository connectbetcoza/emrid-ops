"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/feedback/ToastProvider";
import { transitionWorkItem } from "@/lib/work/server-actions";
import { workActions, type WorkAction, type WorkActionKind } from "@/lib/work/actions";
import { workTypeMeta } from "@/lib/work/work-type";
import type { WorkStatus } from "@/lib/work/status";
import type { WorkItem } from "@/lib/work/types";

const KIND_VARIANT: Record<WorkActionKind, "primary" | "secondary" | "ghost" | "danger"> = {
  primary: "primary",
  secondary: "ghost",
  danger: "ghost",
};

/**
 * Renders ANY work item with its available actions. Actions are persisted via
 * the `transitionWorkItem` server action (mock or DynamoDB per USE_MOCK_DATA):
 * the UI updates optimistically, then confirms on the server result —
 * succeeding with a toast + a route refresh (so the queue/workspace re-project),
 * or reverting with an error toast. No transition fails silently.
 */
export function WorkItemRow({ item }: { item: WorkItem }) {
  const [status, setStatus] = useState<WorkStatus>(item.status);
  const [step, setStep] = useState<number>(item.step ?? 0);
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();
  const meta = workTypeMeta(item.type);
  const Icon = meta.icon;
  const actions = workActions({ type: item.type, status, step });

  function act(action: WorkAction) {
    const prevStatus = status;
    const prevStep = step;
    const nextStep = action.id === "reopen" ? 0 : action.advances ? step + 1 : step;

    // Optimistic.
    setStatus(action.toStatus);
    setStep(nextStep);

    startTransition(async () => {
      try {
        const res = await transitionWorkItem({
          item,
          toStatus: action.toStatus,
          step: nextStep,
        });
        if (res.ok) {
          success(`${action.label}: ${item.title}`);
          router.refresh();
        } else {
          setStatus(prevStatus);
          setStep(prevStep);
          error(res.error);
        }
      } catch {
        setStatus(prevStatus);
        setStep(prevStep);
        error(`Couldn't ${action.label.toLowerCase()} — please try again.`);
      }
    });
  }

  return (
    <li className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{item.title}</span>
          <PriorityBadge priority={item.priority} />
          <StatusBadge status={status} />
        </div>
        <p className="text-xs text-muted-foreground">{item.nextAction}</p>
        <div className="flex flex-wrap gap-2 pt-0.5">
          {actions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={KIND_VARIANT[action.kind]}
              disabled={pending}
              onClick={() => act(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </li>
  );
}
