"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Muted, SectionTitle } from "@/components/ui/Typography";
import { useToast } from "@/components/feedback/ToastProvider";
import { onboardPractitioner } from "@/lib/practitioners/server-actions";

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/**
 * Internal practitioner onboarding (V1: Administration owns creation — no
 * public sign-up). Creates the practice + practitioner records, ACTIVE by
 * default. Cognito credentials remain a manual step unless the existing
 * Cognito user id is supplied.
 */
export function OnboardForm() {
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    registrationNumber: "",
    cognitoUserId: "",
    practiceName: "",
    practiceEmail: "",
    practicePhone: "",
    practiceAddress: "",
  });
  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await onboardPractitioner({
        // Presentation-only split — the contract field remains fullName.
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        email: form.email,
        registrationNumber: form.registrationNumber || undefined,
        cognitoUserId: form.cognitoUserId || undefined,
        practiceName: form.practiceName,
        practiceEmail: form.practiceEmail,
        practicePhone: form.practicePhone || undefined,
        practiceAddress: form.practiceAddress || undefined,
      });
      if (res.ok) {
        success("Practitioner onboarded");
        router.push(`/practitioners/${res.practitionerId}`);
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <SectionTitle>Practitioner</SectionTitle>
          <Muted>The clinician&apos;s own details and credentials.</Muted>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input className={field} value={form.firstName} onChange={set("firstName")} placeholder="Jane" required />
          </Field>
          <Field label="Last name">
            <input className={field} value={form.lastName} onChange={set("lastName")} placeholder="Mokoena" required />
          </Field>
          <Field label="Email">
            <input className={field} type="email" value={form.email} onChange={set("email")} placeholder="jane@practice.co.za" required />
          </Field>
          <Field label="Registration number" hint="e.g. HPCSA number — optional">
            <input className={field} value={form.registrationNumber} onChange={set("registrationNumber")} placeholder="MP-0123456" />
          </Field>
          <Field
            label="Cognito user ID"
            hint="Optional. If the login exists, paste its user id (sub) so the account links; otherwise credentials are set up manually afterwards."
          >
            <input className={field} value={form.cognitoUserId} onChange={set("cognitoUserId")} placeholder="leave blank if not created yet" />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <SectionTitle>Practice</SectionTitle>
          <Muted>Where the practitioner works.</Muted>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Practice name">
            <input className={field} value={form.practiceName} onChange={set("practiceName")} placeholder="Rosebank Family Practice" required />
          </Field>
          <Field label="Practice email">
            <input className={field} type="email" value={form.practiceEmail} onChange={set("practiceEmail")} placeholder="reception@practice.co.za" required />
          </Field>
          <Field label="Practice phone">
            <input className={field} value={form.practicePhone} onChange={set("practicePhone")} placeholder="+27 11 555 0100" />
          </Field>
          <Field label="Practice address">
            <input className={field} value={form.practiceAddress} onChange={set("practiceAddress")} placeholder="12 Baker St, Rosebank" />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={pending}>
        <UserPlus className="h-4 w-4" aria-hidden />
        {pending ? "Onboarding…" : "Onboard practitioner"}
      </Button>
    </form>
  );
}
