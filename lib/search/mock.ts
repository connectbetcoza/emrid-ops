import type { CommandItem } from "@/lib/search/core";
import { OPS_NAV_ITEMS } from "@/lib/navigation";
import { MOCK_CUSTOMERS } from "@/lib/customers/mock";
import { protectionStatus, PROTECTION_STATUS_META } from "@/lib/customers/readiness";

/**
 * Mock command set for the universal search palette. Navigation commands are
 * derived from the real navigation (so they never drift); customers, work
 * items, and actions are static placeholders demonstrating the grouped,
 * search-first interaction. No backend — replaced by live results later.
 */
const NAVIGATION: CommandItem[] = OPS_NAV_ITEMS.map((item) => ({
  id: `nav:${item.href}`,
  title: item.label,
  subtitle: "Go to section",
  group: "Navigation",
  href: item.href,
  keywords: ["navigate", "open", "go to"],
}));

// Customer results deep-link straight into the single Customer Workspace.
const CUSTOMERS: CommandItem[] = MOCK_CUSTOMERS.slice(0, 6).map((c) => ({
  id: `cust:${c.id}`,
  title: c.fullName,
  subtitle: `Customer · ${PROTECTION_STATUS_META[protectionStatus(c)].label}`,
  group: "Customers",
  href: `/customers/${c.id}`,
  keywords: ["customer", c.location ?? "", c.id],
}));

const WORK_ITEMS: CommandItem[] = [
  {
    id: "work:WI-1042",
    title: "Verify identity submission",
    subtitle: "WI-1042 · Urgent",
    group: "Work Items",
    keywords: ["work item", "identity", "wi-1042"],
  },
  {
    id: "work:WI-1046",
    title: "Customer unprotected — no active card",
    subtitle: "WI-1046 · Urgent",
    group: "Work Items",
    keywords: ["work item", "readiness", "wi-1046"],
  },
];

const ACTIONS: CommandItem[] = [
  {
    id: "action:new-work-item",
    title: "Create work item",
    subtitle: "Action",
    group: "Actions",
    keywords: ["new", "add", "create", "task"],
  },
  {
    id: "action:invite-customer",
    title: "Invite customer",
    subtitle: "Action",
    group: "Actions",
    keywords: ["new", "onboard", "invite"],
  },
];

export const MOCK_COMMANDS: CommandItem[] = [
  ...NAVIGATION,
  ...CUSTOMERS,
  ...WORK_ITEMS,
  ...ACTIONS,
];
