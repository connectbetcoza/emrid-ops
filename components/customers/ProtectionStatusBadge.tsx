import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  PROTECTION_STATUS_META,
} from "@/lib/customers/readiness";
import type { ProtectionStatus } from "@/lib/customers/types";

const ICON = {
  PROTECTED: ShieldCheck,
  IN_PROGRESS: ShieldAlert,
  UNPROTECTED: ShieldX,
} as const;

/** Canonical chip for a customer's Protection Status. */
export function ProtectionStatusBadge({
  status,
  className,
}: {
  status: ProtectionStatus;
  className?: string;
}) {
  const meta = PROTECTION_STATUS_META[status];
  const Icon = ICON[status];
  return (
    <Badge tone={meta.tone} className={className}>
      <Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}
