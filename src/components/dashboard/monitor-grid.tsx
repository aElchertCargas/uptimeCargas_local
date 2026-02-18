"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MonitorCard } from "./monitor-card";
import type { MonitorData } from "./monitor-card";

interface MonitorGridProps {
  monitors: MonitorData[];
}

type StatusFilter = "all" | "up" | "down" | "pending";

function getMonitorStatus(monitor: MonitorData): "up" | "down" | "pending" {
  if (!monitor.active) return "pending";
  if (!monitor.latestCheck) return "pending";
  return monitor.latestCheck.isUp ? "up" : "down";
}

function filterMonitors(
  monitors: MonitorData[],
  query: string,
  statusFilter: StatusFilter
): MonitorData[] {
  const q = query.toLowerCase().trim();
  return monitors.filter((m) => {
    const matchesQuery =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.url.toLowerCase().includes(q);
    if (!matchesQuery) return false;
    if (statusFilter === "all") return true;
    return getMonitorStatus(m) === statusFilter;
  });
}

export function MonitorGrid({ monitors }: MonitorGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filteredMonitors = useMemo(
    () => filterMonitors(monitors, searchQuery, statusFilter),
    [monitors, searchQuery, statusFilter]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by name or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono"
          />
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-md border border-input bg-card px-3 py-1 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All status</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
            <option value="pending">Pending</option>
          </select>
          <span className="font-mono text-sm text-muted-foreground">
            {filteredMonitors.length} monitor{filteredMonitors.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filteredMonitors.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-border">
          <p className="font-mono text-sm text-muted-foreground">
            {monitors.length === 0
              ? "No monitors yet. Add one to get started."
              : "No monitors match your filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredMonitors.map((monitor, i) => (
            <MonitorCard key={monitor.id} monitor={monitor} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
