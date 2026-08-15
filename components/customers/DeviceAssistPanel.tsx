"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Nfc } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { assistDevice } from "@/lib/customers/device-actions";
import type { DeviceAssistAction } from "@/lib/customers/device-assist";
import {
  VERIFICATION_METHODS,
  VERIFICATION_METHOD_LABEL,
  type VerificationMethod,
} from "@/lib/customers/contact-correction";

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export type AssistableDevice = {
  deviceId: string;
  status: string;
};

const ACTION_LABEL: Record<DeviceAssistAction, string> = {
  SUSPEND: "Suspend (lost — possibly recoverable)",
  REACTIVATE: "Reactivate (found again)",
  REVOKE: "Revoke (confirmed lost / compromised)",
  REPLACE: "Revoke + issue replacement card",
};

/** Which actions each device status legitimately offers. */
function actionsFor(status: string, canRevoke: boolean): DeviceAssistAction[] {
  const actions: DeviceAssistAction[] = [];
  if (status === "ACTIVE") actions.push("SUSPEND");
  if (status === "SUSPENDED") actions.push("REACTIVATE");
  if (canRevoke && ["PENDING", "ACTIVE", "SUSPENDED"].includes(status)) {
    actions.push("REVOKE", "REPLACE");
  }
  return actions;
}

/**
 * Assisted device support (CMS Stage 2a). Suspending or revoking makes the
 * card stop resolving on the public emergency route — deliberate containment,
 * stated in the copy. Requires verification + reason on every action.
 */
export function DeviceAssistPanel({
  customerId,
  devices,
  canRevoke,
}: {
  customerId: string;
  devices: AssistableDevice[];
  /** Server-computed REVOKE_DEVICES boolean (UI convenience only). */
  canRevoke: boolean;
}) {
  const [deviceId, setDeviceId] = useState(devices[0]?.deviceId ?? "");
  const [action, setAction] = useState<DeviceAssistAction | "">("");
  const [verifiedVia, setVerifiedVia] = useState<VerificationMethod | "">("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  const selected = devices.find((d) => d.deviceId === deviceId);
  const available = selected ? actionsFor(selected.status, canRevoke) : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !action) return;
    startTransition(async () => {
      const res = await assistDevice(customerId, {
        action,
        deviceId,
        verifiedVia,
        reason,
      });
      if (res.ok) {
        success(
          res.action === "REPLACE"
            ? "Device revoked — replacement issued and queued for fulfilment."
            : "Device updated and audited.",
        );
        setAction("");
        setVerifiedVia("");
        setReason("");
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  if (devices.length === 0) return null;

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        A suspended or revoked card stops resolving on the public emergency
        route immediately.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Device</span>
        <select
          className={field}
          value={deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value);
            setAction("");
          }}
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.deviceId} ({d.status})
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Action</span>
        <select
          className={field}
          value={action}
          onChange={(e) => setAction(e.target.value as DeviceAssistAction)}
        >
          <option value="">Select action…</option>
          {available.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">
          Customer verified via
        </span>
        <select
          className={field}
          value={verifiedVia}
          onChange={(e) => setVerifiedVia(e.target.value as VerificationMethod)}
        >
          <option value="">Select verification method…</option>
          {VERIFICATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {VERIFICATION_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Reason</span>
        <textarea
          className={`${field} resize-none`}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What did the customer report?"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending || !action || !verifiedVia || !reason.trim()}
        className="w-full"
      >
        <Nfc className="h-4 w-4" aria-hidden />
        {pending ? "Applying…" : "Apply device action"}
      </Button>
    </form>
  );
}
