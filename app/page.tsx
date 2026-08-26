import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/db/repositories/users";
import { isFirstRunComplete } from "@/lib/db/repositories/settings";

// This page reads from the SQLite DB at runtime — never statically pre-render.
export const dynamic = "force-dynamic";

/**
 * App launch routing (section 4/42):
 *   no admin account yet -> first-run wizard
 *   not logged in -> login
 *   logged in -> Order Registry (never Dashboard - section 4 is explicit
 *   that Order Registry, not Dashboard, is the default landing screen).
 */
export default async function RootPage() {
  if (!isFirstRunComplete() || !hasAnyUser()) {
    redirect("/first-run");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  redirect("/orders");
}
