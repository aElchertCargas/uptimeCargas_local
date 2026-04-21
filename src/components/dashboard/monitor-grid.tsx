"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  MousePointerClick,
  X,
  Trash2,
  Ban,
  Play,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonitorCard } from "./monitor-card";
import type { MonitorData } from "./monitor-card";
import { toast } from "sonner";

interface MonitorGridProps {
  monitors: MonitorData[];
  initialStatusFilter?: StatusFilter;
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

function groupByLetter(monitors: MonitorData[]): Map<string, MonitorData[]> {
  const sorted = [...monitors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const groups = new Map<string, MonitorData[]>();
  for (const m of sorted) {
    const letter = (m.name[0] ?? "#").toUpperCase();
    const key = /^[A-Z]$/.test(letter) ? letter : "#";
    const arr = groups.get(key);
    if (arr) arr.push(m);
    else groups.set(key, [m]);
  }
  return groups;
}

type BulkAction = "delete" | "ban-delete" | "check" | null;

export function MonitorGrid({ monitors, initialStatusFilter = "all" }: MonitorGridProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BulkAction>(null);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  const filteredMonitors = useMemo(
    () => filterMonitors(monitors, searchQuery, statusFilter),
    [monitors, searchQuery, statusFilter]
  );

  const letterGroups = useMemo(
    () => groupByLetter(filteredMonitors),
    [filteredMonitors]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredMonitors.map((m) => m.id)));
  }, [filteredMonitors]);

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/monitors/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to delete monitors");
      return res.json();
    },
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deleted} monitor(s)`);
      exitSelectMode();
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Failed to delete monitors"),
  });

  const bulkBanDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/monitors/bulk-ban-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to ban & delete monitors");
      return res.json();
    },
    onSuccess: (result) => {
      toast.success(
        `Deleted ${result.deleted} monitor(s), banned ${result.banned} hostname(s)`
      );
      exitSelectMode();
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Failed to ban & delete monitors"),
  });

  const bulkCheck = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/monitors/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorIds: ids }),
      });
      if (!res.ok) throw new Error("Failed to run checks");
      return res.json();
    },
    onSuccess: (result) => {
      const suppressed = result.suppression?.suppressedDownTransitions ?? 0;
      toast.success(
        suppressed > 0
          ? `Checked ${result.checked} monitor(s). Suppressed ${suppressed} suspicious down alert(s).`
          : `Checked ${result.checked} monitor(s)`
      );
      exitSelectMode();
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: () => toast.error("Failed to run checks"),
  });

  const isBusy =
    bulkDelete.isPending || bulkBanDelete.isPending || bulkCheck.isPending;

  function executeAction() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    switch (confirmAction) {
      case "delete":
        bulkDelete.mutate(ids);
        break;
      case "ban-delete":
        bulkBanDelete.mutate(ids);
        break;
      case "check":
        bulkCheck.mutate(ids);
        break;
    }
    setConfirmAction(null);
  }

  const confirmMessages: Record<string, { title: string; description: string; button: string }> = {
    delete: {
      title: "Delete selected monitors",
      description: `Are you sure you want to delete ${selectedIds.size} monitor(s)? This cannot be undone.`,
      button: "Delete",
    },
    "ban-delete": {
      title: "Ban & delete selected monitors",
      description: `This will add ${selectedIds.size} hostname(s) to the excluded patterns list and delete the monitors. Future syncs will skip these URLs.`,
      button: "Ban & Delete",
    },
    check: {
      title: "Run checks on selected monitors",
      description: `Run an immediate ping check on ${selectedIds.size} monitor(s)?`,
      button: "Run Checks",
    },
  };

  let globalIndex = 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
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
          {selectMode ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={selectAll}>
                All
              </Button>
              <span className="font-mono text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button size="sm" variant="ghost" onClick={exitSelectMode}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectMode(true)}
            >
              <MousePointerClick className="size-4" />
              Select
            </Button>
          )}
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
        </div>
      </div>

      {/* Monitor list grouped by letter */}
      {filteredMonitors.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-border">
          <p className="font-mono text-sm text-muted-foreground">
            {monitors.length === 0
              ? "No monitors yet. Add one to get started."
              : "No monitors match your filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {[...letterGroups.entries()].map(([letter, group]) => (
            <div key={letter}>
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-1 py-1.5 backdrop-blur-sm">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  {letter}
                </span>
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-xs text-muted-foreground/60">
                  {group.length}
                </span>
              </div>
              <div className="space-y-1 pb-2">
                {group.map((monitor) => {
                  const idx = globalIndex++;
                  return (
                    <MonitorCard
                      key={monitor.id}
                      monitor={monitor}
                      index={idx}
                      selectable={selectMode}
                      selected={selectedIds.has(monitor.id)}
                      onToggleSelect={toggleSelect}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg">
            <span className="mr-2 font-mono text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => setConfirmAction("check")}
            >
              {bulkCheck.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run Check
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={isBusy}
              onClick={() => setConfirmAction("ban-delete")}
            >
              {bulkBanDelete.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Ban className="size-4" />
              )}
              Ban & Delete
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isBusy}
              onClick={() => setConfirmAction("delete")}
            >
              {bulkDelete.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirmAction && confirmMessages[confirmAction] && (
        <Dialog
          open={!!confirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmMessages[confirmAction].title}
              </DialogTitle>
              <DialogDescription>
                {confirmMessages[confirmAction].description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant={confirmAction === "check" ? "default" : "destructive"}
                onClick={executeAction}
                disabled={isBusy}
              >
                {isBusy && <Loader2 className="size-4 animate-spin" />}
                {confirmMessages[confirmAction].button}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
