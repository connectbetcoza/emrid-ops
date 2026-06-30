import { TimelineArea } from "@/components/workspace/TimelineArea";
import { runActivityEngine } from "@/lib/engines/activity";

/**
 * "Recent Activity" widget — the latest operational events, fed by the Activity
 * Engine. Reuses the Workspace TimelineArea, so the dashboard feed and a
 * record's activity rail share one presentation. Mock data only.
 */
export function RecentActivity() {
  return <TimelineArea title="Recent activity" events={runActivityEngine()} />;
}
