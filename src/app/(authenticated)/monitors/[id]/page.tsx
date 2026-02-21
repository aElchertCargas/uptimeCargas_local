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
import { Switch } from "@/components/ui/switch";
import { UptimeBar } from "@/components/dashboard/uptime-bar";
import { ResponseChart } from "@/components/dashboard/response-chart";
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
}

interface ChecksResponse {
  checks: Check[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

type StatusFilter = "all" | "up" | "down";
const PAGE_SIZE = 50;

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

function generateUptimeData(checks: Check[]): { date: string; uptime: number | null }[] {
  const now = new Date();
  const data: { date: string; uptime: number | null }[] = [];

  for (let i = 89; i >= 0; i--) {
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

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Checks Table with Pagination ────────────────────────────────────────────

function PaginatedChecksTable({ monitorId }: { monitorId: string }) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (dateRange?.from) params.set("from", toISODate(dateRange.from));
    if (dateRange?.to) params.set("to", toISODate(dateRange.to));
    if (!dateRange?.from && !dateRange?.to) params.set("hours", "24");
    return `/api/monitors/${monitorId}/checks?${params}`;
  }, [monitorId, page, statusFilter, dateRange]);

  const { data, isLoading, isFetching } = useQuery<ChecksResponse>({
    queryKey: ["monitor-checks", monitorId, page, statusFilter, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
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
    setPage(1);
  };

  const clearDateRange = () => {
    setDateRange(undefined);
    setPage(1);
    setCalendarOpen(false);
  };

  const hasDateFilter = !!dateRange?.from;
  const dateLabel = hasDateFilter
    ? dateRange.to
      ? `${formatDateShort(dateRange.from!)} – ${formatDateShort(dateRange.to)}`
      : formatDateShort(dateRange.from!)
    : "Last 24 hours";

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

          <div className="flex items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={hasDateFilter ? "default" : "outline"}
                  size="sm"
                  className="gap-2 font-mono text-xs"
                >
                  <CalendarIcon className="size-3.5" />
                  {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateSelect}
                  disabled={{ after: new Date() }}
                  numberOfMonths={2}
                  defaultMonth={dateRange?.from ?? new Date(Date.now() - 30 * 86_400_000)}
                />
                <div className="flex items-center justify-between border-t px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={clearDateRange}
                  >
                    Reset to last 24h
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={() => setCalendarOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {hasDateFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={clearDateRange}
              >
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(1)}
                disabled={pagination.page <= 1}
              >
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-2 font-mono text-sm">
                {pagination.page}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={pagination.page >= pagination.pages}
              >
                <ChevronRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(pagination.pages)}
                disabled={pagination.page >= pagination.pages}
              >
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
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

  const { data: monitor, isLoading } = useQuery<Monitor>({
    queryKey: ["monitor", id],
    queryFn: async () => {
      const res = await fetch(`/api/monitors/${id}`);
      if (!res.ok) throw new Error("Failed to fetch monitor");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: chartChecksData } = useQuery<ChecksResponse>({
    queryKey: ["monitor-checks-chart", id],
    queryFn: async () => {
      const res = await fetch(`/api/monitors/${id}/checks?hours=24&limit=500`);
      if (!res.ok) throw new Error("Failed to fetch checks");
      return res.json();
    },
    enabled: !!id,
  });

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

  const chartChecks = chartChecksData?.checks ?? [];
  const uptimeData = generateUptimeData(chartChecks);
  const chartData = chartChecks
    .map((c) => ({
      checkedAt: c.checkedAt,
      responseTime: c.responseTime,
      isUp: c.isUp,
    }))
    .reverse();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
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
          <CardTitle className="font-mono">90-Day Uptime</CardTitle>
          <CardDescription>Daily uptime percentage</CardDescription>
        </CardHeader>
        <CardContent>
          <UptimeBar data={uptimeData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono">Response Time</CardTitle>
          <CardDescription>Last 24 hours</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponseChart data={chartData} />
        </CardContent>
      </Card>

      <PaginatedChecksTable monitorId={id} />

      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/monitors/${id}/edit`}>Edit</Link>
        </Button>
        <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
        >
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
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMonitor.mutate();
                setDeleteDialogOpen(false);
              }}
              disabled={deleteMonitor.isPending}
            >
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
            <Button
              variant="outline"
              onClick={() => setBanDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                banAndDelete.mutate();
                setBanDialogOpen(false);
              }}
              disabled={banAndDelete.isPending}
            >
              <Ban className="size-4" />
              Ban &amp; Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
