"use client";

import { useState } from "react";
import { Check, Copy, CreditCard, Nfc } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { formatDateTime } from "@/lib/format";
import type { DeviceStatus } from "@/lib/data/entities";
import type { FulfilmentPack } from "@/lib/customers/fulfilment-pack";

/** Exhaustive device-status display meta (compiler-enforced on enum growth). */
const DEVICE_STATUS_META: Record<DeviceStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "danger" },
  REPLACED: { label: "Replaced", tone: "neutral" },
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * Card Fulfilment Pack — everything the fulfilment officer needs to encode and
 * verify the physical card, rendered as a Workspace section (never a new page).
 * `pack === null` ⇒ the customer has ISSUE_CARD work but no device yet (the
 * Patient card request creates the device) — say so honestly instead of hiding.
 */
export function CardFulfilmentPack({ pack }: { pack: FulfilmentPack | null }) {
  const { success, error } = useToast();
  const [copied, setCopied] = useState(false);

  if (!pack) {
    return (
      <Card className="space-y-2">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
          Card fulfilment pack
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          No device issued yet. The pack appears when the customer&apos;s card
          request creates a device on the shared platform.
        </p>
      </Card>
    );
  }

  const status = DEVICE_STATUS_META[pack.status];

  async function copyNfcUrl() {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(pack.nfcUrl);
      setCopied(true);
      success("NFC URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error("Couldn't copy — select the URL and copy manually.");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
          Card fulfilment pack
        </CardTitle>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {/* What to encode — the one thing the officer must never have to ask. */}
      <div className="space-y-1.5 rounded-md border border-border bg-muted/50 p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Nfc className="h-3.5 w-3.5" aria-hidden />
          Encode this URL on the card
        </div>
        <p className="break-all font-mono text-xs text-foreground">{pack.nfcUrl}</p>
        <Button size="sm" variant="outline" className="w-full" onClick={copyNfcUrl}>
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy NFC URL"}
        </Button>
      </div>

      <dl className="space-y-2">
        <Row label="EMRID number">
          <span className="font-mono">{pack.emrid}</span>
        </Row>
        <Row label="Device ID">
          <span className="break-all font-mono">{pack.deviceId}</span>
        </Row>
        <Row label="NFC token">
          <span className="break-all font-mono">{pack.token}</span>
        </Row>
        <Row label="Activation code">
          {pack.activationCode ? (
            <span className="font-mono">{pack.activationCode}</span>
          ) : (
            <span className="text-muted-foreground">Not generated</span>
          )}
        </Row>
        <Row label="Last tap">
          {pack.lastTapAt ? (
            <span title="A tap of this card reached the public emergency route.">
              {formatDateTime(pack.lastTapAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">No tap recorded</span>
          )}
        </Row>
      </dl>

      <p className="text-xs text-muted-foreground">
        Tap-test: tap the encoded card with a phone, refresh, and confirm a
        recent tap appears above before marking it verified. Activation is done
        by the customer — dispatch never activates the card.
      </p>
    </Card>
  );
}
