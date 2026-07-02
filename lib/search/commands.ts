import type { CommandItem } from "@/lib/search/core";
import { OPS_NAV_ITEMS } from "@/lib/navigation";
import { PROTECTION_STATUS_META } from "@/lib/customers/readiness";
import type { DirectoryEntry } from "@/lib/data/entities";

/**
 * Command sources for the universal search palette — REAL DATA ONLY.
 * Navigation commands derive from the real navigation (never drift); customer
 * commands derive from the producer-maintained Customer Directory, passed in by
 * the server layout. The former static mock customers/work-items/actions are
 * gone — nothing in the palette pretends.
 */
export const NAVIGATION_COMMANDS: CommandItem[] = OPS_NAV_ITEMS.map((item) => ({
  id: `nav:${item.href}`,
  title: item.label,
  subtitle: "Go to section",
  group: "Navigation",
  href: item.href,
  keywords: ["navigate", "open", "go to"],
}));

/** Customer results deep-link straight into the single Customer Workspace. */
export function customerCommands(entries: DirectoryEntry[]): CommandItem[] {
  return entries.map((entry) => ({
    id: `cust:${entry.profileId}`,
    title: entry.displayName,
    subtitle: `Customer · ${PROTECTION_STATUS_META[entry.protectionStatus].label}`,
    group: "Customers",
    href: `/customers/${entry.profileId}`,
    keywords: ["customer", entry.emrid, entry.profileId],
  }));
}
