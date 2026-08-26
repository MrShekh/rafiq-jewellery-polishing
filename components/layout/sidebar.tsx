"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Users, Settings, Gem } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CurrentUser } from "@/lib/auth/session";

const NAV_ITEMS = [
  { href: "/orders", label: "Order Registry", icon: ClipboardList },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card no-print">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Gem className="h-5 w-5 text-primary" />
        <span className="truncate text-sm font-semibold">sahin Manager</span>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">
        <div className="truncate font-medium text-foreground">{user.displayName}</div>
        <div className="truncate">@{user.username}</div>
      </div>
    </aside>
  );
}
