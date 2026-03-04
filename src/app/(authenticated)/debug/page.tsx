"use client";

import { useEffect, useState, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  Send,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Monitor {
  id: string;
  name: string;
  url: string;
  active: boolean;
  interval: number;
  status: boolean | null;
  responseTime: number | null;
  lastCheckedAt: string | null;
}

interface LogEntry {
  id: string;
  type: string;
  monitor: string;
  channel: string | null;
  message: string;
  createdAt: string;
}

const TYPE_META: Record<string, { icon: typeof ArrowDown; color: string; label: string; badgeClass: string }> = {
  down: { icon: ArrowDown, color: "text-red-500", label: "DOWN", badgeClass: "bg-red-500 text-white" },
  up: { icon: ArrowUp, color: "text-green-500", label: "UP", badgeClass: "bg-green-500 text-white" },
  webhook_sent: { icon: Send, color: "text-blue-400", label: "SENT", badgeClass: "bg-blue-500 text-white" },
  webhook_failed: { icon: AlertTriangle, color: "text-amber-400", label: "FAIL", badgeClass: "bg-amber-500 text-white" },
  ssl_expiring: { icon: ShieldAlert, color: "text-amber-400", label: "SSL", badgeClass: "bg-amber-500 text-white" },
  ssl_error: { icon: ShieldAlert, color: "text-red-500", label: "SSL ERR", badgeClass: "bg-red-500 text-white" },
};

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

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DebugPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/debug/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "init") {
          setMonitors(data.monitors || []);
          setLogs(data.logs || []);
        } else if (data.type === "monitors") {
          setMonitors((prev) => {
            const updated = new Map(prev.map((m) => [m.id, m]));
            for (const monitor of data.monitors || []) {
              updated.set(monitor.id, monitor);
            }
            return Array.from(updated.values()).sort((a, b) => a.name.localeCompare(b.name));
          });
        } else if (data.type === "logs") {
          setLogs((prev) => {
            const newLogs = data.logs || [];
            const combined = [...newLogs, ...prev];
            return combined.slice(0, 500); // Keep last 500 logs
          });
        } else if (data.type === "error") {
          setError(data.message || "Unknown error");
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      if (eventSource.readyState === EventSource.CLOSED) {
        setError("Connection closed");
      }
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const activeMonitors = monitors.filter((m) => m.active);
  const upMonitors = activeMonitors.filter((m) => m.status === true).length;
  const downMonitors = activeMonitors.filter((m) => m.status === false).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Real-Time Debug</h1>
          <p className="text-sm text-muted-foreground">
            Live monitor status and notification stream
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-mono", connected ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
            <div className={cn("size-2 rounded-full", connected ? "bg-green-500 animate-pulse" : "bg-red-500")} />
            {connected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Active Monitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMonitors.length}</div>
            <p className="text-xs text-muted-foreground">of {monitors.length} total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Up</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{upMonitors}</div>
            <p className="text-xs text-muted-foreground">monitors healthy</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Down</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{downMonitors}</div>
            <p className="text-xs text-muted-foreground">monitors failing</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monitors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto space-y-2">
                {monitors.map((monitor) => {
                  const StatusIcon = monitor.status === true ? Wifi : monitor.status === false ? WifiOff : Activity;
                  return (
                    <div
                      key={monitor.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        monitor.status === true && "border-green-500/20 bg-green-500/5",
                        monitor.status === false && "border-red-500/20 bg-red-500/5",
                        monitor.status === null && "border-border bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <StatusIcon className={cn("size-4", monitor.status === true ? "text-green-500" : monitor.status === false ? "text-red-500" : "text-muted-foreground")} />
                            <span className="font-mono text-sm font-medium">{monitor.name}</span>
                            {!monitor.active && (
                              <Badge variant="outline" className="text-xs">Inactive</Badge>
                            )}
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">{monitor.url}</p>
                          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                            <span>Interval: {monitor.interval}s</span>
                            {monitor.responseTime !== null && (
                              <span>Response: {monitor.responseTime}ms</span>
                            )}
                            <span>Checked: {formatTimeAgo(monitor.lastCheckedAt)}</span>
                          </div>
                        </div>
                        {monitor.status !== null && (
                          <Badge
                            className={cn(
                              "ml-2",
                              monitor.status ? "bg-green-500 text-white" : "bg-red-500 text-white"
                            )}
                          >
                            {monitor.status ? "UP" : "DOWN"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Notifications/Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications & Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono w-[140px]">Time</TableHead>
                    <TableHead className="font-mono w-[80px]">Type</TableHead>
                    <TableHead className="font-mono">Monitor</TableHead>
                    <TableHead className="font-mono">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No events yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((entry) => {
                      const meta = TYPE_META[entry.type] ?? TYPE_META.down;
                      const Icon = meta.icon;
                      return (
                        <TableRow key={entry.id} className="animate-in fade-in slide-in-from-right-2 duration-300">
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {formatDateTime(entry.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("gap-1 text-[10px]", meta.badgeClass)}>
                              <Icon className="size-3" />
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">
                            {entry.monitor}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.message}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
