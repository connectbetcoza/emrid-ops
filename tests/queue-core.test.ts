import { describe, it, expect } from "vitest";
import {
  processQueue,
  buildFacetPredicate,
  toggleId,
  areAllSelected,
  togglePageSelection,
} from "@/lib/queue/core";

type Row = { id: string; status: string; n: number };

const rows: Row[] = [
  { id: "a", status: "OPEN", n: 3 },
  { id: "b", status: "DONE", n: 1 },
  { id: "c", status: "OPEN", n: 2 },
  { id: "d", status: "OPEN", n: 5 },
  { id: "e", status: "DONE", n: 4 },
];

describe("processQueue", () => {
  it("paginates without mutating the input", () => {
    const snapshot = [...rows];
    const r = processQueue(rows, { page: 1, pageSize: 2 });
    expect(r.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.total).toBe(5);
    expect(r.filteredTotal).toBe(5);
    expect(r.pageCount).toBe(3);
    expect(rows).toEqual(snapshot); // comparator/sort never mutates source
  });

  it("clamps an out-of-range page into the valid range", () => {
    const r = processQueue(rows, { page: 99, pageSize: 2 });
    expect(r.page).toBe(3);
    expect(r.items.map((x) => x.id)).toEqual(["e"]);
  });

  it("applies predicate then comparator then pagination", () => {
    const r = processQueue(rows, {
      predicate: (x) => x.status === "OPEN",
      comparator: (a, b) => a.n - b.n,
      page: 1,
      pageSize: 10,
    });
    expect(r.filteredTotal).toBe(3);
    expect(r.items.map((x) => x.id)).toEqual(["c", "a", "d"]);
  });

  it("reports pageCount ≥ 1 even when empty", () => {
    const r = processQueue([], { page: 1, pageSize: 5 });
    expect(r.pageCount).toBe(1);
    expect(r.items).toEqual([]);
  });
});

describe("buildFacetPredicate", () => {
  it("ignores cleared facets and ANDs active ones", () => {
    const all = buildFacetPredicate<Row>([
      { getValue: (r) => r.status, selected: null },
    ]);
    expect(rows.filter(all)).toHaveLength(5);

    const open = buildFacetPredicate<Row>([
      { getValue: (r) => r.status, selected: "OPEN" },
    ]);
    expect(rows.filter(open).map((r) => r.id)).toEqual(["a", "c", "d"]);
  });
});

describe("selection helpers", () => {
  it("toggleId adds then removes", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("areAllSelected reflects full-page selection", () => {
    expect(areAllSelected(["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(areAllSelected(["a", "b"], ["a"])).toBe(false);
    expect(areAllSelected([], ["a"])).toBe(false);
  });

  it("togglePageSelection selects the page, then clears it", () => {
    const pageIds = ["a", "b"];
    const afterSelect = togglePageSelection([], pageIds);
    expect(afterSelect.sort()).toEqual(["a", "b"]);
    const afterClear = togglePageSelection(["a", "b", "z"], pageIds);
    expect(afterClear).toEqual(["z"]); // unrelated selections preserved
  });
});
