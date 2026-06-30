import { redirect } from "next/navigation";

/** The platform entry point routes into Mission Control. */
export default function HomePage() {
  redirect("/mission-control");
}
