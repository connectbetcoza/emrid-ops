"use client";

import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { signIn, type SignInState } from "@/lib/auth/actions";

const INITIAL: SignInState = { error: null };

const fieldClasses =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Email + password sign-in form. Posts to the `signIn` server action via
 * `useActionState`, which returns a calm error message on failure (the action
 * redirects on success, so there is no success state to render here). The
 * server-validated `next` destination travels as a hidden field. Token-styled
 * inputs only — no new design primitives.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          className={fieldClasses}
          aria-describedby={state.error ? "signin-error" : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="text-sm font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClasses}
          aria-describedby={state.error ? "signin-error" : undefined}
        />
      </div>

      <div aria-live="polite" className="min-h-[1.25rem]">
        {state.error ? (
          <p
            id="signin-error"
            className="flex items-center gap-1.5 text-sm text-danger"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {state.error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        <LogIn className="h-4 w-4" aria-hidden />
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
