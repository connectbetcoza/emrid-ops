import { Nfc } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import type { Device, DeviceStatus } from "@/lib/data/entities";

/** Exhaustive device-status display metadata (Rule 9). */
const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "In fulfilment", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "danger" },
  REPLACED: { label: "Replaced", tone: "neutral" },
};

/**
 * The customer's NFC devices — a support read over repository state. Tokens
 * and activation codes stay in the Card Fulfilment Pack (shown only during
 * active card work); support sees status and dates, not secrets.
 */
export function DevicesCard({ devices }: { devices: Device[] }) {
  return (
    <Card className="space-y-3">
      <CardTitle>Devices</CardTitle>
      {devices.length === 0 ? (
        <EmptyState
          icon={Nfc}
          title="No devices"
          description="No card has been requested yet."
        />
      ) : (
        <ul className="space-y-2.5">
          {devices.map((device) => {
            const meta = DEVICE_STATUS_META[device.status];
            return (
              <li
                key={device.deviceId}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {device.deviceId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {device.activatedAt
                      ? `Activated ${formatDate(device.activatedAt)}`
                      : `Issued ${formatDate(device.issuedAt)}`}
                  </p>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
