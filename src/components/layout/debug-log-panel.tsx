"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Bug,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  ArrowDown,
  ArrowUp,
  Send,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DebugLogEntry {
  id: string;
  type: string;
  monitor: string;
  channel: string | null;
  message: string;
  createdAt: string;
}

interface DebugLogResponse {
  enabled: boolean;
  logs: DebugLogEntry[];
}

const TYPE_CONFIG: Record<string, { icon: typeof ArrowDown; color: string; label: string }> = {
  down: { icon: ArrowDown, color: "text-[var(--color-status-down)]", label: "DOWN" },
  up: { icon: ArrowUp, color: "text-[var(--color-status-up)]", label: "UP" },
  webhook_sent: { icon: Send, color: "text-blue-400", label: "SENT" },
  webhook_failed: { icon: AlertTriangle, color: "text-amber-400", label: "FAIL" },
  zendesk_ticket: { icon: Send, color: "text-violet-400", label: "ZENDESK" },
  zendesk_ticket_failed: {
    icon: AlertTriangle,
    color: "text-violet-400",
    label: "ZENDESK FAIL",
  },
  ssl_expiring: { icon: ShieldAlert, color: "text-amber-400", label: "SSL" },
  ssl_error: { icon: ShieldAlert, color: "text-[var(--color-status-down)]", label: "SSL ERR" },
};

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DebugLogPanel() {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading } = useQuery<DebugLogResponse>({
    queryKey: ["debug-log"],
    queryFn: async () => {
      const res = await fetch("/api/debug-log?limit=100");
      if (!res.ok) throw new Error("Failed to fetch debug log");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/debug-log", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debug-log"] });
      toast.success("Debug log cleared");
    },
  });

  if (!data?.enabled && !isLoading) return null;

  const logs = data?.logs ?? [];

  return (
    <div className="flex flex-col border-t border-border bg-sidebar">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between gap-2 px-4 py-2 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Bug className="size-3.5" />
          Debug Log
          {logs.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none">
              {logs.length}
            </span>
          )}
        </span>
        {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {!collapsed && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between px-3 pb-1">
            <Link
              href="/debug-log"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ExternalLink className="size-2.5" />
            </Link>
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                <Trash2 className="size-3" />
                Clear
              </Button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto px-2 pb-2 scrollbar-thin">
            {logs.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                No events yet
              </p>
            ) : (
              <div className="space-y-px">
                {logs.map((entry) => {
                  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.down;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={entry.id}
                      className="group flex items-start gap-2 rounded px-2 py-1 hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <Icon className={cn("mt-0.5 size-3 shrink-0", cfg.color)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className={cn("font-mono text-[10px] font-semibold", cfg.color)}>
                            {cfg.label}
                          </span>
                          <span className="truncate text-[11px] font-medium text-sidebar-foreground">
                            {entry.monitor}
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {entry.channel && (
                            <span className="font-mono">[{entry.channel}] </span>
                          )}
                          {entry.message}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60">
                        {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
