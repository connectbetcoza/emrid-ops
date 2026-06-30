import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        404
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you’re looking for doesn’t exist or has moved.
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-primary hover:underline"
      >
        Return home
      </Link>
    </main>
  );
}
