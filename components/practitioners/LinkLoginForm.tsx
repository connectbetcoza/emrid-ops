"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { linkPractitionerLogin } from "@/lib/practitioners/server-actions";

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Link a Cognito login to an unlinked account. Shown only while credentials
 * are pending — linking re-keys the record to the sub, so on success we land
 * on the record's new address.
 */
export function LinkLoginForm({ practitionerId }: { practitionerId: string }) {
  const [pending, startTransition] = useTransition();
  const [cognitoUserId, setCognitoUserId] = useState("");
  const { success, error } = useToast();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await linkPractitionerLogin(practitionerId, cognitoUserId);
      if (res.ok) {
        success("Login linked — the practitioner can now sign in.");
        router.replace(`/practitioners/${res.practitionerId}`);
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">
          Cognito user id (sub)
        </span>
        <input
          className={field}
          value={cognitoUserId}
          onChange={(e) => setCognitoUserId(e.target.value)}
          placeholder="e.g. 1f2a3b4c-…"
        />
      </label>
      <Button type="submit" disabled={pending || !cognitoUserId.trim()}>
        <KeyRound className="h-4 w-4" aria-hidden />
        {pending ? "Linking…" : "Link login account"}
      </Button>
    </form>
  );
}
