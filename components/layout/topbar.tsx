"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Monitor, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SyncStatusBadge } from "@/components/layout/sync-status-badge";
import { useSession } from "@/components/providers/session-provider";
import { api } from "@/lib/api-client";

export function Topbar() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { refresh } = useSession();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  async function handleLogout() {
    try {
      await api.post("/api/auth/logout");
      refresh();
      router.push("/login");
    } catch {
      toast.error("Could not log out. Please try again.");
    }
  }

  const ThemeIcon = !mounted ? Monitor : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="flex h-12 shrink-0 items-center justify-end gap-2 border-b px-4 no-print">
      <SyncStatusBadge compact />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Change theme">
            <ThemeIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="h-4 w-4" /> Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="h-4 w-4" /> Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor className="h-4 w-4" /> System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  );
}
