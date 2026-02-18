"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StatsHeader, type StatsSummary } from "@/components/dashboard/stats-header";
import { MonitorGrid } from "@/components/dashboard/monitor-grid";
import type { MonitorData } from "@/components/dashboard/monitor-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

interface StatsResponse {
  summary: StatsSummary;
  monitors: MonitorData[];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function DashboardPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, dataUpdatedAt } = useQuery<StatsResponse>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 30 * 1000,
  });

  const runChecks = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cron/check", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "local-dev-secret"}` },
      });
      if (!res.ok) throw new Error("Check cycle failed");
      return res.json();
    },
    onSuccess: (result) => {
      toast.success(`Checked ${result.checked} monitor(s)`);
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Failed to run checks"),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor status overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt > 0 && (
            <span className="font-mono text-xs text-muted-foreground">
              Last refresh: {formatTime(new Date(dataUpdatedAt))}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => runChecks.mutate()}
            disabled={runChecks.isPending}
          >
            {runChecks.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Run Checks
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          <StatsHeader summary={data.summary} />
          <MonitorGrid monitors={data.monitors} />
        </>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border">
          <p className="font-mono text-sm text-muted-foreground">
            No data available. Add monitors to get started.
          </p>
        </div>
      )}
    </div>
  );
}
