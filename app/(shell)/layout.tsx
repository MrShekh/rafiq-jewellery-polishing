import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// This layout reads the session from SQLite at runtime — never statically pre-render.
export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</main>
      </div>
    </div>
  );
}
