import type { ReactNode } from "react";
import { Card, CardTitle } from "@/components/ui/Card";

/**
 * Container for the primary actions available on a record. Lays its children
 * out as a vertical stack of full-width controls (Buttons), so action panels
 * look consistent across every workspace.
 */
export function ActionPanel({
  title = "Actions",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3">
      <CardTitle>{title}</CardTitle>
      <div className="flex flex-col gap-2 [&>*]:w-full">{children}</div>
    </Card>
  );
}
