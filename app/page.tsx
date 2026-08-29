import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyUser } from "@/lib/db/repositories/users";
import { isFirstRunComplete } from "@/lib/db/repositories/settings";

export const dynamic = "force-dynamic";

/**
 * App launch routing:
 *   no admin account yet -> first-run wizard
 *   not logged in -> login
 *   logged in -> Order Registry
 */
export default async function RootPage() {
  const [firstRun, hasUser] = await Promise.all([
    isFirstRunComplete(),
    hasAnyUser(),
  ]);

  if (!firstRun || !hasUser) {
    redirect("/first-run");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  redirect("/orders");
}
