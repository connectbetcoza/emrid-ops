"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/feedback/ToastProvider";
import { updatePractitionerAccount } from "@/lib/practitioners/server-actions";
import type { Practice, Practitioner, PractitionerStatus } from "@/lib/data/entities";

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const STATUS_OPTIONS: { value: PractitionerStatus; label: string }[] = [
  { value: "APPROVED", label: "Active" },
  { value: "PENDING", label: "Pending activation" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "REJECTED", label: "Deactivated" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Account particulars management — every save is audited
 * (PRACTITIONER_UPDATED) and read back by the practitioner portal.
 */
export function AccountForm({
  practitioner,
  practice,
}: {
  practitioner: Practitioner;
  practice: Practice | null;
}) {
  const [pending, startTransition] = useTransition();
  const { success, error } = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: practitioner.fullName,
    email: practitioner.email,
    registrationNumber: practitioner.registrationNumber ?? "",
    status: practitioner.status,
    practiceName: practice?.name ?? "",
    practiceEmail: practice?.email ?? "",
    practicePhone: practice?.phone ?? "",
    practiceAddress: practice?.address ?? "",
  });
  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updatePractitionerAccount({
        practitionerId: practitioner.practitionerId,
        practiceId: practitioner.practiceId,
        practitioner: {
          fullName: form.fullName,
          email: form.email,
          registrationNumber: form.registrationNumber,
          status: form.status as PractitionerStatus as
            | "APPROVED" | "PENDING" | "SUSPENDED" | "REJECTED",
        },
        practice: practice
          ? {
              name: form.practiceName,
              email: form.practiceEmail,
              phone: form.practicePhone,
              address: form.practiceAddress,
            }
          : {},
      });
      if (res.ok) {
        success("Account updated");
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className={field} value={form.fullName} onChange={set("fullName")} required />
        </Field>
        <Field label="Email">
          <input className={field} type="email" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="Registration number">
          <input className={field} value={form.registrationNumber} onChange={set("registrationNumber")} />
        </Field>
        <Field label="Status">
          <select className={field} value={form.status} onChange={set("status")}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>
      {practice ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Practice name">
            <input className={field} value={form.practiceName} onChange={set("practiceName")} required />
          </Field>
          <Field label="Practice email">
            <input className={field} type="email" value={form.practiceEmail} onChange={set("practiceEmail")} />
          </Field>
          <Field label="Practice phone">
            <input className={field} value={form.practicePhone} onChange={set("practicePhone")} />
          </Field>
          <Field label="Practice address">
            <input className={field} value={form.practiceAddress} onChange={set("practiceAddress")} />
          </Field>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        <Save className="h-4 w-4" aria-hidden />
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
