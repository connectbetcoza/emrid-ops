import { redirect } from "next/navigation";

/** The dashboard was renamed to Mission Control. Preserve old links/bookmarks. */
export default function DashboardRedirect() {
  redirect("/mission-control");
}
