/**
 * Error-reporting core (GH-1) — the single seam every error path funnels
 * through. Dependency-free and side-effect-safe: it emits ONE single-line
 * structured JSON record to stderr, which Amplify SSR forwards to CloudWatch
 * Logs, where a metric filter on the stable marker turns it into an alarm
 * (see OPERATOR_HANDOFF — Observability). Swappable later for Sentry/OTel
 * behind this unchanged signature.
 *
 * Rules for callers: `extra` carries ids/scopes/booleans ONLY — never names,
 * emails, id numbers, tokens, or medical values.
 */

export const ERROR_MARKER = "emrid-ops:error";

export type ErrorReportContext = {
  /** Where it happened, e.g. "route:ops-shell", "action:signIn", "api:client-error". */
  scope: string;
  /** Next.js error digest when present (correlates client + server records). */
  digest?: string;
  /** Safe structured context — ids only, never PII. */
  extra?: Record<string, string | number | boolean | undefined>;
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

/** Report an error. NEVER throws — observability must not break the request. */
export function reportError(error: unknown, context: ErrorReportContext): void {
  try {
    const err = error instanceof Error ? error : null;
    const record = {
      marker: ERROR_MARKER,
      scope: context.scope,
      digest: context.digest ?? (err as { digest?: string } | null)?.digest,
      name: err?.name ?? typeof error,
      message: truncate(err?.message ?? String(error), 500),
      stack: err?.stack ? truncate(err.stack, 2000) : undefined,
      ...context.extra,
      at: new Date().toISOString(),
    };
    console.error(JSON.stringify(record));
  } catch {
    // Last resort — never let reporting cascade.
  }
}
