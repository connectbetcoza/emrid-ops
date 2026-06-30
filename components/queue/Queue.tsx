"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ChevronRight, Inbox, X } from "lucide-react";
import {
  buildFacetPredicate,
  processQueue,
  areAllSelected,
  toggleId,
  togglePageSelection,
} from "@/lib/queue/core";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export type QueueFilter<T> = {
  key: string;
  label: string;
  getValue: (item: T) => string;
  options: { value: string; label: string }[];
};

export type QueueSort<T> = {
  key: string;
  label: string;
  comparator: (a: T, b: T) => number;
};

export type QueueBulkAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onRun: (ids: string[]) => void;
};

/**
 * The single reusable queue. Owns UI state (filters, sort, page, selection) and
 * delegates all data work to the pure `processQueue` core. Every future
 * operational queue is a configuration of this component — never a new one.
 *
 * Selection persists across pages; "select all" toggles the current page.
 */
export function Queue<T>({
  items,
  getId,
  renderItem,
  filters = [],
  sorts = [],
  bulkActions = [],
  pageSize = 8,
  emptyTitle = "Nothing in this queue",
  emptyDescription = "Items that need attention will appear here.",
}: {
  items: T[];
  getId: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  filters?: QueueFilter<T>[];
  sorts?: QueueSort<T>[];
  bulkActions?: QueueBulkAction[];
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string>(sorts[0]?.key ?? "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const predicate = useMemo(
    () =>
      buildFacetPredicate(
        filters.map((f) => ({
          getValue: f.getValue,
          selected: filterValues[f.key] ?? null,
        })),
      ),
    [filters, filterValues],
  );

  const comparator = useMemo(
    () => sorts.find((s) => s.key === sortKey)?.comparator,
    [sorts, sortKey],
  );

  const result = useMemo(
    () => processQueue(items, { predicate, comparator, page, pageSize }),
    [items, predicate, comparator, page, pageSize],
  );

  const pageIds = result.items.map(getId);
  const allSelected = areAllSelected(pageIds, selected);
  const rangeStart =
    result.filteredTotal === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const rangeEnd = (result.page - 1) * pageSize + result.items.length;

  function setFilter(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function runBulk(action: QueueBulkAction) {
    action.onRun(selected);
    setSelected([]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: filters + sort */}
      {(filters.length > 0 || sorts.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <Select
              key={filter.key}
              aria-label={`Filter by ${filter.label}`}
              value={filterValues[filter.key] ?? ""}
              onChange={(e) => setFilter(filter.key, e.target.value)}
              options={[
                { value: "", label: `All ${filter.label}` },
                ...filter.options,
              ]}
            />
          ))}
          {sorts.length > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <label
                htmlFor="queue-sort"
                className="text-xs text-muted-foreground"
              >
                Sort
              </label>
              <Select
                id="queue-sort"
                aria-label="Sort by"
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value);
                  setPage(1);
                }}
                options={sorts.map((s) => ({ value: s.key, label: s.label }))}
              />
            </div>
          ) : null}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-muted px-3 py-2"
        >
          <span className="text-sm font-medium text-primary">
            {selected.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            {bulkActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => runBulk(action)}
                >
                  {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
                  {action.label}
                </Button>
              );
            })}
            <IconButton
              label="Clear selection"
              size="sm"
              onClick={() => setSelected([])}
            >
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      ) : null}

      {/* List */}
      {result.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
            <input
              type="checkbox"
              aria-label="Select all on this page"
              checked={allSelected}
              onChange={() =>
                setSelected((prev) => togglePageSelection(prev, pageIds))
              }
              className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {result.filteredTotal} item{result.filteredTotal === 1 ? "" : "s"}
              {result.filteredTotal !== result.total
                ? ` · filtered from ${result.total}`
                : ""}
            </span>
          </div>
          <ul role="list" className="divide-y divide-border">
            {result.items.map((item) => {
              const id = getId(item);
              const isSelected = selected.includes(id);
              return (
                <li
                  key={id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors",
                    isSelected ? "bg-primary-muted/50" : "hover:bg-accent/50",
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${id}`}
                    checked={isSelected}
                    onChange={() =>
                      setSelected((prev) => toggleId(prev, id))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {renderItem(item)}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {result.filteredTotal > 0 ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {result.filteredTotal}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {result.page} of {result.pageCount}
            </span>
            <IconButton
              label="Previous page"
              size="sm"
              disabled={result.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton
              label="Next page"
              size="sm"
              disabled={result.page >= result.pageCount}
              onClick={() =>
                setPage((p) => Math.min(result.pageCount, p + 1))
              }
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
