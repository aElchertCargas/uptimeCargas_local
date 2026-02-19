"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export interface LatestCheck {
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
  checkedAt: string;
}

export interface MonitorData {
  id: string;
  name: string;
  url: string;
  active: boolean;
  interval: number;
  tags: string[];
  latestCheck: LatestCheck | null;
  uptime24h: number | null;
  avgResponseTime: number | null;
  totalChecks24h: number;
}

type StatusType = "up" | "down" | "pending";

function getStatus(monitor: MonitorData): StatusType {
  if (!monitor.active) return "pending";
  if (!monitor.latestCheck) return "pending";
  return monitor.latestCheck.isUp ? "up" : "down";
}

interface MonitorCardProps {
  monitor: MonitorData;
  index?: number;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function MonitorCard({
  monitor,
  index = 0,
  selectable = false,
  selected = false,
  onToggleSelect,
}: MonitorCardProps) {
  const status = getStatus(monitor);
  const responseTime =
    monitor.latestCheck?.responseTime ?? monitor.avgResponseTime ?? null;

  const dotColor = {
    up: "bg-[var(--color-status-up)]",
    down: "bg-[var(--color-status-down)]",
    pending: "bg-[var(--color-status-pending)]",
  }[status];

  const uptimeColor =
    status === "down"
      ? "text-[var(--color-status-down)]"
      : status === "up"
        ? "text-[var(--color-status-up)]"
        : "text-muted-foreground";

  const inner = (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:bg-accent/50 animate-fade-in-up",
        status === "down" && "border-[var(--color-status-down)]/30",
        selected && "border-primary/50 bg-primary/5"
      )}
      style={{ animationDelay: `${Math.min(index * 20, 400)}ms` }}
    >
      {selectable && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect?.(monitor.id);
          }}
          className="shrink-0"
        >
          <Checkbox checked={selected} tabIndex={-1} />
        </div>
      )}

      <div className={cn("size-2 shrink-0 rounded-full", dotColor)} />

      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={monitor.name}>
        {monitor.name}
      </span>

      <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {responseTime != null ? `${responseTime} ms` : "—"}
      </span>

      <span className={cn("w-16 shrink-0 text-right font-mono text-xs font-medium", uptimeColor)}>
        {monitor.uptime24h != null ? `${monitor.uptime24h.toFixed(1)}%` : "—"}
      </span>

      <div className={cn("size-2.5 shrink-0 rounded-full", dotColor)} />
    </div>
  );

  if (selectable) {
    return (
      <div
        className="block cursor-pointer"
        onClick={() => onToggleSelect?.(monitor.id)}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/monitors/${monitor.id}`} className="block">
      {inner}
    </Link>
  );
}
