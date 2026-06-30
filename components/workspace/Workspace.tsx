import type { ReactNode } from "react";

/**
 * The reusable record-workspace layout: a full-width header over a two-column
 * body — the main column (tabbed content, then the timeline) and a properties
 * rail (summary, then actions). Every record surface in EMRID Operations
 * (customer, identity case, fulfilment job, practitioner, ticket) composes this
 * same skeleton, so navigation between record types feels identical.
 *
 * All regions are slots; pass the matching framework components
 * (WorkspaceHeader / TabbedContentArea / TimelineArea / SummaryPanel /
 * ActionPanel) or any node.
 */
export function Workspace({
  header,
  children,
  timeline,
  summary,
  actions,
}: {
  header: ReactNode;
  /** Main content — typically a <TabbedContentArea />. */
  children: ReactNode;
  timeline?: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  const hasRail = Boolean(summary || actions);
  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {children}
          {timeline}
        </div>
        {hasRail ? (
          <aside className="space-y-6 lg:col-span-1">
            {summary}
            {actions}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
