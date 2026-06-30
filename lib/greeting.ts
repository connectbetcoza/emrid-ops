/** Pure time-of-day greeting helpers. The hour is supplied by the caller. */

export type TimeOfDay = "morning" | "afternoon" | "evening";

export function timeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** e.g. greeting(8, "Michael") → "Good morning, Michael". */
export function greeting(hour: number, name: string): string {
  return `Good ${timeOfDay(hour)}, ${name}`;
}
