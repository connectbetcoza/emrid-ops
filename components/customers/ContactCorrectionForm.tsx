"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { correctContactDetails } from "@/lib/customers/contact-actions";
import {
  VERIFICATION_METHODS,
  VERIFICATION_METHOD_LABEL,
  type VerificationMethod,
} from "@/lib/customers/contact-correction";

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * CMS Stage 1 — support contact correction. CONTACT details only: this can
 * never change the customer's login email (Cognito is untouched), and the copy
 * says so. Every correction requires a verification method + reason, which are
 * recorded in the audit trail and a support note (field names only, no values).
 */
export function ContactCorrectionForm({
  profileId,
  currentEmail,
  currentMobile,
}: {
  profileId: string;
  currentEmail: string;
  currentMobile?: string;
}) {
  const [email, setEmail] = useState(currentEmail);
  const [mobile, setMobile] = useState(currentMobile ?? "");
  const [verifiedVia, setVerifiedVia] = useState<VerificationMethod | "">("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    startTransition(async () => {
      const res = await correctContactDetails(profileId, {
        contactEmail: email.trim() !== currentEmail ? email : undefined,
        contactMobile:
          mobile.trim() !== (currentMobile ?? "") ? mobile : undefined,
        verifiedVia,
        reason,
      });
      if (res.ok) {
        success("Contact details corrected and audited.");
        setVerifiedVia("");
        setReason("");
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        Contact details only — this does{" "}
        <strong className="font-semibold">not</strong> change the customer&apos;s
        login email.
      </p>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Contact email</span>
        <input
          className={field}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">Contact mobile</span>
        <input
          className={field}
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="+27 82 000 0000"
        />
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
          placeholder="Why is this correction needed?"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending || !verifiedVia || !reason.trim()}
        className="w-full"
      >
        <UserCog className="h-4 w-4" aria-hidden />
        {pending ? "Saving…" : "Save correction"}
      </Button>
    </form>
  );
}
