/**
 * Pure command-palette search. No React/DOM. The palette UI calls
 * `searchCommands` on every keystroke and `groupCommands` to render sections.
 * Designed as the future universal-navigation engine: today it ranks a static
 * mock command set; later it ranks live results from the same scoring rules.
 */

export type CommandGroup =
  | "Navigation"
  | "Customers"
  | "Practitioners"
  | "Work Items"
  | "Actions";

export type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  group: CommandGroup;
  /** Extra match terms not shown in the title (e.g. ids, synonyms). */
  keywords?: string[];
  /** Destination for navigation-type results. */
  href?: string;
};

/** Display order for groups in the palette. */
export const COMMAND_GROUP_ORDER: readonly CommandGroup[] = [
  "Navigation",
  "Customers",
  "Practitioners",
  "Work Items",
  "Actions",
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Score an item against a query. Higher is better; `null` means no match.
 *   title prefix      → 3
 *   title substring   → 2
 *   keyword/subtitle  → 1
 * An empty query matches everything at score 0 (preserves source order).
 */
export function scoreCommand(item: CommandItem, query: string): number | null {
  const q = normalize(query);
  if (q.length === 0) return 0;

  const title = normalize(item.title);
  if (title.startsWith(q)) return 3;
  if (title.includes(q)) return 2;

  const extras = [item.subtitle ?? "", ...(item.keywords ?? [])]
    .map(normalize)
    .join(" ");
  if (extras.includes(q)) return 1;

  return null;
}

/**
 * Filter + rank commands for a query. Stable: ties keep their original order,
 * so an empty query returns the full list in source order. Optional `limit`
 * caps the result count.
 */
export function searchCommands(
  items: CommandItem[],
  query: string,
  limit?: number,
): CommandItem[] {
  const scored = items
    .map((item, index) => ({ item, index, score: scoreCommand(item, query) }))
    .filter((entry): entry is { item: CommandItem; index: number; score: number } =>
      entry.score !== null,
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);

  return limit !== undefined ? scored.slice(0, limit) : scored;
}

/** Group results into ordered sections, dropping empty groups. */
export function groupCommands(
  items: CommandItem[],
): Array<{ group: CommandGroup; items: CommandItem[] }> {
  return COMMAND_GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);
}
