import {
  BadgeCheck,
  CreditCard,
  Gauge,
  LifeBuoy,
  LineChart,
  ListChecks,
  Radar,
  Settings,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export type OpsNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * A navigation group renders as a block of links separated from its
 * neighbours by a divider. The optional `label` is a quiet section heading
 * (shown only when the sidebar is expanded). This grouped shape is the
 * permanent navigation contract: future sprints add *items*, never new
 * top-level navigation patterns.
 */
export type OpsNavGroup = {
  id: string;
  label?: string;
  items: OpsNavItem[];
};

/**
 * EMRID Operations primary navigation — the permanent information architecture.
 *
 *   Mission Control
 *   ──────────────
 *   Customer Readiness · Identity Verification · Card Fulfilment ·
 *   Practitioners · Customer Support · Work Items
 *   ──────────────
 *   Executive · Administration
 */
export const OPS_NAV: OpsNavGroup[] = [
  {
    id: "overview",
    items: [
      { label: "Mission Control", href: "/mission-control", icon: Radar },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { label: "Customer Readiness", href: "/customer-readiness", icon: Gauge },
      {
        label: "Identity Verification",
        href: "/identity-verification",
        icon: BadgeCheck,
      },
      { label: "Card Fulfilment", href: "/card-fulfilment", icon: CreditCard },
      { label: "Practitioners", href: "/practitioners", icon: Stethoscope },
      { label: "Customer Support", href: "/customer-support", icon: LifeBuoy },
      { label: "Work Items", href: "/work-items", icon: ListChecks },
    ],
  },
  {
    id: "leadership",
    label: "Leadership",
    items: [
      { label: "Executive", href: "/executive", icon: LineChart },
      { label: "Administration", href: "/administration", icon: Settings },
    ],
  },
];

/** Flat list of every navigable destination — used by search and active-state. */
export const OPS_NAV_ITEMS: OpsNavItem[] = OPS_NAV.flatMap((g) => g.items);

/** Resolve whether a nav href is active for the current pathname. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
