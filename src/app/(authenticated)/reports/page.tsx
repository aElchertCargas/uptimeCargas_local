"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketChart } from "@/components/reports/ticket-chart";
import { TicketStatsCard } from "@/components/reports/ticket-stats-card";

interface TicketStats {
  total: number;
  resolved: number;
  open: number;
  averageResolutionTime: number;
  byUser: Array<{
    user: string;
    count: number;
  }>;
  byMonitor: Array<{
    monitor: string;
    count: number;
  }>;
  recentIncidents: Array<{
    id: string;
    monitorName: string;
    startedAt: string;
    resolvedAt: string | null;
    duration: number | null;
    message: string | null;
  }>;
}

export default function ReportsPage() {
  const { data, isLoading } = useQuery<TicketStats>({
    queryKey: ["ticket-stats"],
    queryFn: async () => {
      const res = await fetch("/api/reports/tickets");
      if (!res.ok) throw new Error("Failed to fetch ticket statistics");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ticketing Reports</h1>
          <p className="text-sm text-muted-foreground">
            Incident and downtime ticket statistics
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ticketing Reports</h1>
        <p className="text-sm text-muted-foreground">
          Incident and downtime ticket statistics
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TicketStatsCard
          title="Total Incidents"
          value={data.total}
          description="All time"
        />
        <TicketStatsCard
          title="Open Incidents"
          value={data.open}
          description="Currently active"
          variant="warning"
        />
        <TicketStatsCard
          title="Resolved Incidents"
          value={data.resolved}
          description="Closed tickets"
          variant="success"
        />
        <TicketStatsCard
          title="Avg Resolution Time"
          value={`${Math.round(data.averageResolutionTime)} min`}
          description="Time to resolve"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Incidents by Monitor</CardTitle>
            <CardDescription>Top monitors with most incidents</CardDescription>
          </CardHeader>
          <CardContent>
            <TicketChart data={data.byMonitor} dataKey="monitor" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Incidents</CardTitle>
            <CardDescription>Latest downtime events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recentIncidents.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No recent incidents
                </p>
              ) : (
                data.recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">
                        {incident.monitorName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(incident.startedAt).toLocaleString()}
                      </p>
                      {incident.message && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {incident.message}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {incident.resolvedAt ? (
                        <span className="text-xs text-[var(--color-status-up)]">
                          Resolved
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-status-down)]">
                          Open
                        </span>
                      )}
                      {incident.duration && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(incident.duration)} min
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
