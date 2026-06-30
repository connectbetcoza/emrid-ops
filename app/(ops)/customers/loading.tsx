import { Skeleton } from "@/components/ui/Skeleton";

/** Loading skeleton for the Customers index — mirrors the search + list shape. */
export default function CustomersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <Skeleton className="h-3.5 w-24" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="hidden h-5 w-24 rounded-full sm:block" />
              <Skeleton className="hidden h-5 w-32 rounded-full sm:block" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
