"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bug,
  LayoutDashboard,
  Plus,
  Settings,
  Radio,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DebugLogPanel } from "@/components/layout/debug-log-panel";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/monitors/new", label: "Add Monitor", icon: Plus },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/debug-log", label: "Debug Log", icon: Bug },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <Radio className="h-5 w-5 text-[var(--color-status-up)]" />
        <span className="font-mono text-sm font-semibold tracking-tight text-sidebar-foreground">
          UPTIME CARGAS
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <DebugLogPanel />

      <div className="border-t border-border px-3 py-3 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
        <div className="flex items-center gap-2 px-3 text-xs text-muted-foreground">
          <Activity className="h-3 w-3" />
          <span className="font-mono">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
