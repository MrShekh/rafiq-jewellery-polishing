import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * App launch routing:
 *   not logged in → /login  (login page has a "Sign up" link)
 *   logged in     → /orders
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  redirect("/orders");
}
