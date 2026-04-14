"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarIcon,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UptimeBar } from "@/components/dashboard/uptime-bar";
import { ResponseChart } from "@/components/dashboard/response-chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getIncidentZendeskStatus, type IncidentZendeskStatusKey } from "@/lib/incident-zendesk-status";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

interface Check {
  id: string;
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
  checkedAt: string;
}

interface Monitor {
  id: string;
  name: string;
  url: string;
  method: string;
  interval: number;
  timeout: number;
  expectedStatus: number[];
  active: boolean;
  tags: string[];
  checks: Check[];
  incidents: Array<{
    id: string;
    startedAt: string;
    resolvedAt: string | null;
    message: string | null;
    zendeskTicketId: string | null;
    zendeskRecoveryStatus: string | null;
  }>;
  sslExpiresAt: string | null;
  sslIssuer: string | null;
  sslLastCheckedAt: string | null;
}

interface ChecksResponse {
  checks: Check[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

type StatusFilter = "all" | "up" | "down";
const PAGE_SIZE = 50;

interface TimeFilter {
  from: string | null;
  to: string | null;
}

function getStatusBadge(monitor: Monitor) {
  if (!monitor.active) {
    return <Badge className="bg-[var(--color-status-pending)] text-white">PENDING</Badge>;
  }
  const latest = monitor.checks?.[0];
  if (!latest) {
    return <Badge className="bg-[var(--color-status-pending)] text-white">PENDING</Badge>;
  }
  if (latest.isUp) {
    return <Badge className="bg-[var(--color-status-up)] text-white">UP</Badge>;
  }
  return <Badge className="bg-[var(--color-status-down)] text-white">DOWN</Badge>;
}

function generateUptimeData(checks: Check[], days: number): { date: string; uptime: number | null }[] {
  const now = new Date();
  const data: { date: string; uptime: number | null }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);

    const dayChecks = checks.filter((c) => {
      const t = new Date(c.checkedAt).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    });

    let uptime: number | null = null;
    if (dayChecks.length > 0) {
      const up = dayChecks.filter((c) => c.isUp).length;
      uptime = (up / dayChecks.length) * 100;
    }

    data.push({ date: dateStr, uptime });
  }
  return data;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getIncidentZendeskBadgeClass(key: IncidentZendeskStatusKey): string {
  switch (key) {
    case "recovery_posted":
      return "bg-[var(--color-status-up)] text-white";
    case "recovery_failed":
      return "bg-[var(--color-status-down)] text-white";
    case "ticket_open":
      return "bg-violet-600 text-white";
    case "recovery_skipped":
      return "bg-amber-500 text-white";
    case "recovery_unknown":
      return "bg-muted text-foreground";
    case "no_ticket":
    default:
      return "bg-muted text-foreground";
  }
}

const CHART_HOUR_OPTIONS = [
  { value: 1, label: "1h" },
  { value: 3, label: "3h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
  { value: 72, label: "3d" },
] as const;

const UPTIME_DAY_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
] as const;

// ─── Checks Table with Pagination ────────────────────────────────────────────

function applyTime(date: Date, time: string): Date {
  const d = new Date(date);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function PaginatedChecksTable({
  monitorId,
  chartFilter,
  onClearChartFilter,
  defaultHours,
}: {
  monitorId: string;
  chartFilter: TimeFilter;
  onClearChartFilter: () => void;
  defaultHours: number;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [fromTime, setFromTime] = useState("00:00");
  const [toTime, setToTime] = useState("23:59");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const [initialNow] = useState(() => Date.now());
  const retentionDays = parseInt(settings?.retentionDays ?? "90", 10);
  const earliestDate = new Date(initialNow - retentionDays * 86_400_000);

  const hasChartFilter = !!(chartFilter.from && chartFilter.to);
  const hasCalendarFilter = !!dateRange?.from;
  const activeSource = hasChartFilter ? "chart" : hasCalendarFilter ? "calendar" : "default";

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (statusFilter !== "all") params.set("status", statusFilter);

    if (hasChartFilter) {
      params.set("from", chartFilter.from!);
      params.set("to", chartFilter.to!);
    } else if (hasCalendarFilter) {
      params.set("from", applyTime(dateRange!.from!, fromTime).toISOString());
      if (dateRange!.to) {
        params.set("to", applyTime(dateRange!.to, toTime).toISOString());
      } else {
        params.set("to", applyTime(dateRange!.from!, toTime).toISOString());
      }
    } else {
      params.set("hours", String(defaultHours));
    }
    return `/api/monitors/${monitorId}/checks?${params}`;
  }, [monitorId, page, statusFilter, chartFilter, dateRange, fromTime, toTime, hasChartFilter, hasCalendarFilter, defaultHours]);

  const { data, isLoading, isFetching } = useQuery<ChecksResponse>({
    queryKey: ["monitor-checks", monitorId, page, statusFilter, chartFilter.from, chartFilter.to, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), fromTime, toTime, defaultHours],
    queryFn: async () => {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error("Failed to fetch checks");
      return res.json();
    },
  });

  const checks = data?.checks ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, pages: 0 };

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    onClearChartFilter();
    setPage(1);
  };

  const clearAll = () => {
    setDateRange(undefined);
    setFromTime("00:00");
    setToTime("23:59");
    onClearChartFilter();
    setPage(1);
    setCalendarOpen(false);
  };

  // Reset page when chart filter changes
  const [prevChartFrom, setPrevChartFrom] = useState(chartFilter.from);
  if (chartFilter.from !== prevChartFrom) {
    setPrevChartFrom(chartFilter.from);
    setPage(1);
  }

  let filterLabel: string;
  if (hasChartFilter) {
    filterLabel = `${formatTimeShort(chartFilter.from!)} – ${formatTimeShort(chartFilter.to!)} (chart selection)`;
  } else if (hasCalendarFilter) {
    filterLabel = dateRange!.to
      ? `${formatDateShort(dateRange!.from!)} ${fromTime} – ${formatDateShort(dateRange!.to)} ${toTime}`
      : `${formatDateShort(dateRange!.from!)} ${fromTime} – ${toTime}`;
  } else {
    const opt = CHART_HOUR_OPTIONS.find((o) => o.value === defaultHours);
    filterLabel = opt ? `Last ${opt.label}` : `Last ${defaultHours}h`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="font-mono">Checks</CardTitle>
              <CardDescription>
                {pagination.total.toLocaleString()} total
                {isFetching && !isLoading ? " · refreshing…" : ""}
              </CardDescription>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 py-1 font-mono text-sm outline-none focus:ring-2 focus:ring-ring sm:w-auto"
            >
              <option value="all">All status</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={activeSource === "calendar" ? "default" : "outline"}
                  size="sm"
                  className="gap-2 font-mono text-xs"
                >
                  <CalendarIcon className="size-3.5" />
                  {hasChartFilter ? "Pick dates…" : filterLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateSelect}
                  disabled={{ before: earliestDate, after: new Date() }}
                  defaultMonth={dateRange?.from ?? earliestDate}
                />
                <div className="flex items-center gap-4 border-t px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                    <Input
                      type="time"
                      value={fromTime}
                      onChange={(e) => { setFromTime(e.target.value); setPage(1); }}
                      className="h-8 w-[7rem] font-mono text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                    <Input
                      type="time"
                      value={toTime}
                      onChange={(e) => { setToTime(e.target.value); setPage(1); }}
                      className="h-8 w-[7rem] font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t px-3 py-2">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={clearAll}>
                    Reset to last {CHART_HOUR_OPTIONS.find((o) => o.value === defaultHours)?.label ?? `${defaultHours}h`}
                  </Button>
                  <Button size="sm" className="text-xs" onClick={() => setCalendarOpen(false)}>
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {hasChartFilter && (
              <Badge variant="secondary" className="gap-1.5 font-mono text-xs py-1">
                {filterLabel}
                <button onClick={onClearChartFilter} className="ml-1 rounded-full p-0.5 hover:bg-destructive/20">
                  <X className="size-3" />
                </button>
              </Badge>
            )}

            {(hasCalendarFilter || hasChartFilter) && !hasChartFilter && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={clearAll}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-mono">Time</TableHead>
              <TableHead className="font-mono">Status</TableHead>
              <TableHead className="font-mono">Response Time</TableHead>
              <TableHead className="font-mono">Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <div className="h-5 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))
            ) : checks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No checks found for this time range
                </TableCell>
              </TableRow>
            ) : (
              checks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell className="font-mono text-sm">
                    {formatDateTime(check.checkedAt)}
                  </TableCell>
                  <TableCell>
                    {check.isUp ? (
                      <Badge className="bg-[var(--color-status-up)] text-white">UP</Badge>
                    ) : (
                      <Badge className="bg-[var(--color-status-down)] text-white">DOWN</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {check.responseTime} ms
                  </TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-sm text-muted-foreground">
                    {check.message ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t pt-4 mt-4">
            <p className="text-xs text-muted-foreground font-mono">
              Page {pagination.page} of {pagination.pages}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(1)} disabled={pagination.page <= 1}>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pagination.page <= 1}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-2 font-mono text-sm">{pagination.page}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={pagination.page >= pagination.pages}>
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setPage(pagination.pages)} disabled={pagination.page >= pagination.pages}>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SSL Info Card ───────────────────────────────────────────────────────────

function getSslColor(days: number): string {
  if (days <= 0) return "text-[var(--color-status-down)]";
  if (days <= 7) return "text-[var(--color-status-down)]";
  if (days <= 30) return "text-amber-500";
  return "text-[var(--color-status-up)]";
}

function getSslBadge(days: number) {
  if (days <= 0) {
    return <Badge className="bg-[var(--color-status-down)] text-white">EXPIRED</Badge>;
  }
  if (days <= 7) {
    return <Badge className="bg-[var(--color-status-down)] text-white">CRITICAL</Badge>;
  }
  if (days <= 30) {
    return <Badge className="bg-amber-500 text-white">WARNING</Badge>;
  }
  return <Badge className="bg-[var(--color-status-up)] text-white">VALID</Badge>;
}

function SslInfoCard({ monitor }: { monitor: Monitor }) {
  const [initialNow] = useState(() => Date.now());

  if (!monitor.sslExpiresAt) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <CardTitle className="font-mono text-base">SSL Certificate</CardTitle>
          </div>
          <CardDescription>
            Not yet checked. Run an SSL check from Settings or wait for the daily scan.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const expiresAt = new Date(monitor.sslExpiresAt);
  const daysRemaining = Math.floor((expiresAt.getTime() - initialNow) / 86_400_000);
  const colorClass = getSslColor(daysRemaining);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`size-4 ${colorClass}`} />
            <CardTitle className="font-mono text-base">SSL Certificate</CardTitle>
          </div>
          {getSslBadge(daysRemaining)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Expires</p>
            <p className="font-mono text-sm font-medium">
              {expiresAt.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days Remaining</p>
            <p className={`font-mono text-sm font-medium ${colorClass}`}>
              {daysRemaining <= 0 ? "Expired" : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Issuer</p>
            <p className="font-mono text-sm font-medium truncate">
              {monitor.sslIssuer ?? "Unknown"}
            </p>
          </div>
        </div>
        {monitor.sslLastCheckedAt && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Last checked: {formatDateTime(monitor.sslLastCheckedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentHistoryCard({ incidents }: { incidents: Monitor["incidents"] }) {
  const recentIncidents = incidents.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">Recent Incidents</CardTitle>
        <CardDescription>
          Zendesk ticket and recovery status for the latest downtime events
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recentIncidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents recorded yet.</p>
          ) : (
            recentIncidents.map((incident) => {
              const zendeskStatus = getIncidentZendeskStatus({
                resolvedAt: incident.resolvedAt,
                zendeskTicketId: incident.zendeskTicketId,
                zendeskRecoveryStatus: incident.zendeskRecoveryStatus,
              });

              return (
                <div
                  key={incident.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            incident.resolvedAt
                              ? "bg-[var(--color-status-up)] text-white"
                              : "bg-[var(--color-status-down)] text-white"
                          }
                        >
                          {incident.resolvedAt ? "Resolved" : "Open"}
                        </Badge>
                        <Badge className={getIncidentZendeskBadgeClass(zendeskStatus.key)}>
                          {zendeskStatus.label}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        Started: {formatDateTime(incident.startedAt)}
                      </p>
                      {incident.resolvedAt && (
                        <p className="font-mono text-xs text-muted-foreground">
                          Recovered: {formatDateTime(incident.resolvedAt)}
                        </p>
                      )}
                      {incident.message && (
                        <p className="text-sm text-muted-foreground">
                          {incident.message}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:max-w-xs sm:text-right">
                      <p className="text-xs text-muted-foreground">
                        {zendeskStatus.description}
                      </p>
                      {incident.zendeskTicketId && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          Ticket #{incident.zendeskTicketId}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Monitor Detail Page ─────────────────────────────────────────────────────

export default function MonitorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const [chartFilter, setChartFilter] = useState<TimeFilter>({ from: null, to: null });
  const [chartHours, setChartHours] = useState(6);
  const [uptimeDays, setUptimeDays] = useState(7);

  const { data: monitor, isLoading } = useQuery<Monitor>({
    queryKey: ["monitor", id],
    queryFn: async () => {
      const res = await fetch(`/api/monitors/${id}`);
      if (!res.ok) throw new Error("Failed to fetch monitor");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: uptimeChecksData } = useQuery<ChecksResponse>({
    queryKey: ["monitor-checks-uptime", id, uptimeDays],
    queryFn: async () => {
      const hours = uptimeDays * 24;
      const res = await fetch(`/api/monitors/${id}/checks?hours=${hours}&limit=500`);
      if (!res.ok) throw new Error("Failed to fetch checks");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: chartChecksData } = useQuery<ChecksResponse>({
    queryKey: ["monitor-checks-chart", id, chartHours],
    queryFn: async () => {
      const res = await fetch(`/api/monitors/${id}/checks?hours=${chartHours}&limit=500`);
      if (!res.ok) throw new Error("Failed to fetch checks");
      return res.json();
    },
    enabled: !!id,
  });

  const handleChartRangeSelect = useCallback((from: string, to: string) => {
    setChartFilter({ from, to });
  }, []);

  const clearChartFilter = useCallback(() => {
    setChartFilter({ from: null, to: null });
  }, []);

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const res = await fetch(`/api/monitors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitor", id] });
    },
    onError: () => toast.error("Failed to update monitor"),
  });

  const deleteMonitor = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/monitors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success("Monitor deleted");
      router.push("/");
    },
    onError: () => toast.error("Failed to delete monitor"),
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);

  const banAndDelete = useMutation({
    mutationFn: async () => {
      if (!monitor) return;
      const url = new URL(monitor.url);
      const pattern = url.hostname;
      await fetch("/api/excluded-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern }),
      });
      const res = await fetch(`/api/monitors/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast.success("Monitor banned and deleted");
      router.push("/");
    },
    onError: () => toast.error("Failed to ban and delete monitor"),
  });

  if (isLoading || !monitor) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const uptimeChecks = uptimeChecksData?.checks ?? [];
  const chartChecks = chartChecksData?.checks ?? [];
  const uptimeData = generateUptimeData(uptimeChecks, uptimeDays);
  const chartData = chartChecks
    .map((c) => ({ checkedAt: c.checkedAt, responseTime: c.responseTime, isUp: c.isUp }))
    .reverse();

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{monitor.name}</h1>
          <p className="font-mono text-sm text-muted-foreground">{monitor.url}</p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(monitor)}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Active</span>
            <Switch
              checked={monitor.active}
              onCheckedChange={(v) => toggleActive.mutate(v)}
              disabled={toggleActive.isPending}
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="font-mono">{uptimeDays}-Day Uptime</CardTitle>
                <CardDescription>Daily uptime percentage</CardDescription>
              </div>
              <Select value={String(uptimeDays)} onValueChange={(v) => setUptimeDays(Number(v))}>
                <SelectTrigger size="sm" className="w-[6.5rem] font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPTIME_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <UptimeBar data={uptimeData} />
        </CardContent>
      </Card>

      {monitor.url.startsWith("https://") && (
        <SslInfoCard monitor={monitor} />
      )}

      <IncidentHistoryCard incidents={monitor.incidents} />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="font-mono">Response Time</CardTitle>
                <CardDescription>
                  Last {CHART_HOUR_OPTIONS.find((o) => o.value === chartHours)?.label ?? `${chartHours}h`} — drag to
                  select a time range
                </CardDescription>
              </div>
              <Select value={String(chartHours)} onValueChange={(v) => setChartHours(Number(v))}>
                <SelectTrigger size="sm" className="w-[5rem] font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_HOUR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {chartFilter.from && (
              <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs w-fit" onClick={clearChartFilter}>
                <X className="size-3" />
                Clear selection
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponseChart data={chartData} onRangeSelect={handleChartRangeSelect} />
        </CardContent>
      </Card>

      <PaginatedChecksTable
        monitorId={id}
        chartFilter={chartFilter}
        onClearChartFilter={clearChartFilter}
        defaultHours={chartHours}
      />

      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/monitors/${id}/edit`}>Edit</Link>
        </Button>
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
          Delete
        </Button>
        <Button
          variant="outline"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
          onClick={() => setBanDialogOpen(true)}
        >
          <Ban className="size-4" />
          Ban &amp; Delete
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete monitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{monitor.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { deleteMonitor.mutate(); setDeleteDialogOpen(false); }} disabled={deleteMonitor.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban &amp; delete monitor</DialogTitle>
            <DialogDescription>
              This will add <span className="font-mono font-medium text-foreground">{(() => { try { return new URL(monitor.url).hostname; } catch { return monitor.url; } })()}</span> to the excluded patterns list and delete the monitor. Future syncs will skip URLs matching this pattern.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { banAndDelete.mutate(); setBanDialogOpen(false); }} disabled={banAndDelete.isPending}>
              <Ban className="size-4" />
              Ban &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
