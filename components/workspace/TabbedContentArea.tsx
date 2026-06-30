"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type WorkspaceTab = {
  id: string;
  label: string;
  content: ReactNode;
};

/**
 * Accessible tabbed region for the main body of a workspace. Implements the
 * WAI-ARIA tabs pattern: a `tablist` with roving focus (←/→/Home/End), `tab`
 * controls linked to their `tabpanel`. The active panel is the only one in the
 * DOM, keeping it lightweight.
 */
export function TabbedContentArea({
  tabs,
  defaultTabId,
}: {
  tabs: WorkspaceTab[];
  defaultTabId?: string;
}) {
  const baseId = useId();
  const [activeId, setActiveId] = useState(
    defaultTabId ?? tabs[0]?.id ?? "",
  );
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (tabs.length === 0) return null;
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0]!;

  function focusTab(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    setActiveId(tab.id);
    tabRefs.current[tab.id]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(tabs.length - 1);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Workspace sections"
        className="flex items-center gap-1 border-b border-border"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[tab.id] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeTab.id}`}
        aria-labelledby={`${baseId}-tab-${activeTab.id}`}
        tabIndex={0}
        className="pt-4 focus-visible:outline-none"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
