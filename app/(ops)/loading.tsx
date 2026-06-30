import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

/** Route-level loading state for the operations shell. */
export default function OpsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <SkeletonText lines={2} />
          </Card>
        ))}
      </div>
    </div>
  );
}
