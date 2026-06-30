/**
 * Pure queue engine. No React/DOM — the reusable <Queue> component holds the
 * UI state and delegates all data work here, so the filter/sort/paginate/select
 * behaviour is unit-tested in isolation and shared by every future queue
 * (identity review, fulfilment, support, …) without reimplementation.
 */

export type SortDirection = "asc" | "desc";

export type QueueQuery<T> = {
  /** Keep only items the predicate accepts (built from active filters). */
  predicate?: (item: T) => boolean;
  /** Order the filtered items. Applied to a copy — never mutates input. */
  comparator?: (a: T, b: T) => number;
  /** 1-based page index; clamped into range. */
  page: number;
  pageSize: number;
};

export type QueueResult<T> = {
  /** Items on the resolved page. */
  items: T[];
  /** Total before filtering. */
  total: number;
  /** Total after filtering. */
  filteredTotal: number;
  /** Resolved (clamped) 1-based page. */
  page: number;
  /** Number of pages for the filtered set (always ≥ 1). */
  pageCount: number;
};

/** filter → sort → paginate, as one pure transform. */
export function processQueue<T>(all: T[], q: QueueQuery<T>): QueueResult<T> {
  const total = all.length;
  const filtered = q.predicate ? all.filter(q.predicate) : all.slice();
  if (q.comparator) filtered.sort(q.comparator);

  const filteredTotal = filtered.length;
  const pageSize = Math.max(1, q.pageSize);
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const page = Math.min(Math.max(1, q.page), pageCount);
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    total,
    filteredTotal,
    page,
    pageCount,
  };
}

/** Build a single predicate from active facet selections. */
export function buildFacetPredicate<T>(
  facets: Array<{ getValue: (item: T) => string; selected: string | null }>,
): (item: T) => boolean {
  const active = facets.filter((f) => f.selected !== null && f.selected !== "");
  return (item: T) => active.every((f) => f.getValue(item) === f.selected);
}

// --- Selection helpers (operate on a readonly id list; return a new array) ---

export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
}

export function areAllSelected(
  pageIds: readonly string[],
  selected: readonly string[],
): boolean {
  return pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
}

/** Toggle the whole page: clear it if fully selected, else add all page ids. */
export function togglePageSelection(
  selected: readonly string[],
  pageIds: readonly string[],
): string[] {
  if (areAllSelected(pageIds, selected)) {
    const remove = new Set(pageIds);
    return selected.filter((id) => !remove.has(id));
  }
  const next = new Set(selected);
  for (const id of pageIds) next.add(id);
  return [...next];
}
