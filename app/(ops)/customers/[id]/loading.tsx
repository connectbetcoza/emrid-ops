import { Skeleton } from "@/components/ui/Skeleton";
import { Card } from "@/components/ui/Card";

/** Loading skeleton for the Customer Workspace — mirrors header + tabs + rail. */
export default function CustomerWorkspaceLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex gap-4 border-b border-border pb-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Card className="space-y-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </Card>
            <Card className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          </div>
          {/* Rail */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-[72px] w-[72px] rounded-full" />
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
            </Card>
            <Card className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
