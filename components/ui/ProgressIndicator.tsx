import { cn } from "@/lib/utils";

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

type Tone = "primary" | "success" | "warning" | "danger";

const barTones: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const strokeTones: Record<Tone, string> = {
  primary: "stroke-primary",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
};

/** Horizontal determinate progress bar. */
export function LinearProgress({
  value,
  tone = "primary",
  label,
  className,
}: {
  value: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const pct = clampPercent(value);
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", barTones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Circular gauge — the dashboard "Operational Health" ring. Renders the value
 * in the centre. Tone defaults to a health band (green/amber/red) unless given.
 */
export function CircularProgress({
  value,
  size = 96,
  strokeWidth = 8,
  tone,
  label,
  className,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const pct = clampPercent(value);
  const resolvedTone: Tone =
    tone ?? (pct >= 90 ? "success" : pct >= 70 ? "warning" : "danger");
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="fill-none stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "fill-none transition-[stroke-dashoffset]",
            strokeTones[resolvedTone],
          )}
        />
      </svg>
      <span className="absolute text-lg font-semibold tracking-tight text-foreground">
        {Math.round(pct)}%
      </span>
    </div>
  );
}
