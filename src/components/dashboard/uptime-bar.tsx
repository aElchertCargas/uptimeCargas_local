"use client";

import { useMemo } from "react";

export interface UptimeBarDataPoint {
  date: string;
  uptime: number | null;
}

interface UptimeBarProps {
  data: UptimeBarDataPoint[];
}

function getSegmentColor(uptime: number | null): string {
  if (uptime === null) return "bg-muted";
  if (uptime >= 99) return "bg-[var(--color-status-up)]";
  if (uptime > 0) return "bg-[var(--color-status-up)]/70";
  return "bg-[var(--color-status-down)]";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UptimeBar({ data }: UptimeBarProps) {
  const segments = useMemo(() => {
    const sorted = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    return sorted.slice(-90);
  }, [data]);

  if (segments.length === 0) {
    return (
      <div className="h-8 w-full rounded border border-border bg-muted/20" />
    );
  }

  return (
    <div className="flex h-8 w-full gap-px overflow-hidden rounded border border-border bg-muted/20">
      {segments.map((point, i) => {
        const color = getSegmentColor(point.uptime);
        const label =
          point.uptime !== null
            ? `${formatDate(point.date)} · ${point.uptime.toFixed(1)}% uptime`
            : `${formatDate(point.date)} · No data`;

        return (
          <div
            key={`${point.date}-${i}`}
            className="group relative min-w-0 flex-1"
            title={label}
          >
            <div
              className={`h-full min-w-[2px] transition-colors ${color} hover:opacity-90`}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-popover px-2 py-1 font-mono text-xs text-popover-foreground shadow-md group-hover:block">
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
