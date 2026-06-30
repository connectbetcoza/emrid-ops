"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";

/**
 * A Button for actions that have no backend yet. On click it gives clear
 * "mock" feedback via a toast instead of silently doing nothing — the Sprint 2
 * way to make inert affordances honest and responsive. `action` names the
 * intent for the toast message.
 */
export function MockActionButton({
  action,
  children,
  onClick,
  ...props
}: ButtonProps & { action: string; children: ReactNode }) {
  const { mock } = useToast();
  return (
    <Button
      {...props}
      onClick={(e) => {
        onClick?.(e);
        mock(action);
      }}
    >
      {children}
    </Button>
  );
}
