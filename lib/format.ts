/**
 * Lightweight display formatters. Presentation-only — callers pass ISO strings
 * and get human-readable labels. Locale fixed to en-ZA to match the programme.
 */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
