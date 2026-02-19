"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  Loader2,
  X,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Notification Channel Types ──────────────────────────────────────────────

type NotificationChannelType = "webhook" | "pushover";

interface WebhookConfig {
  url: string;
}

interface PushoverConfig {
  userKey: string;
  appToken: string;
  priority?: number;
  sound?: string;
  device?: string;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  config: WebhookConfig | PushoverConfig;
  enabled: boolean;
  createdAt: string;
}

const PRIORITY_OPTIONS = [
  { value: "-2", label: "Lowest (-2)" },
  { value: "-1", label: "Low (-1)" },
  { value: "0", label: "Normal (0)" },
  { value: "1", label: "High (1)" },
  { value: "2", label: "Emergency (2)" },
];

// ─── Excluded Pattern Types ──────────────────────────────────────────────────

interface ExcludedPattern {
  id: string;
  pattern: string;
  createdAt: string;
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function fetchChannels(): Promise<NotificationChannel[]> {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("Failed to fetch channels");
  return res.json();
}

async function createChannel(data: {
  name: string;
  type: NotificationChannelType;
  config: WebhookConfig | PushoverConfig;
  enabled: boolean;
}): Promise<NotificationChannel> {
  const res = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create channel");
  }
  return res.json();
}

async function updateChannel(
  id: string,
  data: Partial<NotificationChannel>
): Promise<NotificationChannel> {
  const res = await fetch(`/api/notifications/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to update channel");
  }
  return res.json();
}

async function deleteChannel(id: string): Promise<void> {
  const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete channel");
}

async function testChannel(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/notifications/${id}/test`, {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Test failed");
  return data;
}

async function fetchPatterns(): Promise<ExcludedPattern[]> {
  const res = await fetch("/api/excluded-patterns");
  if (!res.ok) throw new Error("Failed to fetch patterns");
  return res.json();
}

// ─── Channel Form ────────────────────────────────────────────────────────────

function ChannelForm({
  channel,
  onSuccess,
  onCancel,
}: {
  channel?: NotificationChannel | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!channel;

  const [name, setName] = useState(channel?.name ?? "");
  const [type, setType] = useState<NotificationChannelType>(
    channel?.type ?? "webhook"
  );
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);

  const [url, setUrl] = useState(
    (channel?.type === "webhook" ? (channel.config as WebhookConfig).url : "") ?? ""
  );

  const [userKey, setUserKey] = useState(
    (channel?.type === "pushover"
      ? (channel.config as PushoverConfig).userKey
      : "") ?? ""
  );
  const [appToken, setAppToken] = useState(
    (channel?.type === "pushover"
      ? (channel.config as PushoverConfig).appToken
      : "") ?? ""
  );
  const [priority, setPriority] = useState<string>(
    String(
      (channel?.type === "pushover"
        ? (channel.config as PushoverConfig).priority ?? 0
        : 0)
    )
  );
  const [sound, setSound] = useState(
    (channel?.type === "pushover"
      ? (channel.config as PushoverConfig).sound
      : "") ?? ""
  );
  const [device, setDevice] = useState(
    (channel?.type === "pushover"
      ? (channel.config as PushoverConfig).device
      : "") ?? ""
  );

  const createMutation = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Channel created");
      onSuccess();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NotificationChannel> }) =>
      updateChannel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Channel updated");
      onSuccess();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config =
      type === "webhook"
        ? { url }
        : {
            userKey,
            appToken,
            priority: parseInt(priority, 10),
            ...(sound && { sound }),
            ...(device && { device }),
          };

    if (type === "webhook" && !url.trim()) {
      toast.error("URL is required");
      return;
    }
    if (type === "pushover" && (!userKey.trim() || !appToken.trim())) {
      toast.error("User Key and App Token are required");
      return;
    }

    if (isEditing && channel) {
      updateMutation.mutate({
        id: channel.id,
        data: { name: name.trim(), type, config, enabled },
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        type,
        config,
        enabled,
      });
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="channel-name">Name</Label>
        <Input
          id="channel-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Slack Alerts"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select
          value={type}
          onValueChange={(v) => setType(v as NotificationChannelType)}
          disabled={isEditing}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook">Webhook</SelectItem>
            <SelectItem value="pushover">Pushover</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {type === "webhook" && (
        <div className="space-y-2">
          <Label htmlFor="webhook-url">URL</Label>
          <Input
            id="webhook-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.example.com/..."
          />
        </div>
      )}

      {type === "pushover" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pushover-userKey">User Key</Label>
            <Input
              id="pushover-userKey"
              value={userKey}
              onChange={(e) => setUserKey(e.target.value)}
              placeholder="Your Pushover user key"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pushover-appToken">App Token</Label>
            <Input
              id="pushover-appToken"
              value={appToken}
              onChange={(e) => setAppToken(e.target.value)}
              placeholder="Your Pushover application token"
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pushover-sound">Sound (optional)</Label>
            <Input
              id="pushover-sound"
              value={sound}
              onChange={(e) => setSound(e.target.value)}
              placeholder="pushover, bike, bugle, etc."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pushover-device">Device (optional)</Label>
            <Input
              id="pushover-device"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="Device name"
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <Switch id="form-enabled" checked={enabled} onCheckedChange={setEnabled} />
        <Label htmlFor="form-enabled">Enabled</Label>
      </div>

      <DialogFooter className="gap-2 sm:gap-0 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEditing ? "Save" : "Add Channel"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Delete Confirmation ─────────────────────────────────────────────────────

function DeleteConfirmDialog({
  channel,
  onDeleted,
  onCancel,
}: {
  channel: NotificationChannel;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteChannel(channel.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Channel deleted");
      onDeleted();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Are you sure you want to delete &quot;{channel.name}&quot;? This action cannot
        be undone.
      </p>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onCancel} disabled={deleteMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Delete
        </Button>
      </DialogFooter>
    </div>
  );
}

// ─── Channel Card ────────────────────────────────────────────────────────────

function ChannelCard({ channel }: { channel: NotificationChannel }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<NotificationChannel>) =>
      updateChannel(channel.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const testMutation = useMutation({
    mutationFn: () => testChannel(channel.id),
    onSuccess: (data) => {
      toast.success(data.success ? "Test notification sent" : "Test failed");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Test failed"),
  });

  const handleToggleEnabled = (checked: boolean) => {
    updateMutation.mutate({ enabled: checked });
  };

  return (
    <Card className="border-l-4 border-l-muted hover:border-l-primary/50 transition-colors">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base truncate">{channel.name}</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs capitalize">
              {channel.type}
            </Badge>
          </div>
          <CardDescription className="mt-1 text-xs font-mono">
            {channel.type === "webhook"
              ? (channel.config as WebhookConfig).url
              : `User: ${(channel.config as PushoverConfig).userKey.slice(0, 8)}…`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={channel.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={updateMutation.isPending}
          />
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-2 px-4 pb-3 pt-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          {testMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Test
        </Button>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Pencil className="size-4" />
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Channel</DialogTitle>
              <DialogDescription>
                Update the notification channel settings.
              </DialogDescription>
            </DialogHeader>
            <ChannelForm
              channel={channel}
              onSuccess={() => setEditOpen(false)}
              onCancel={() => setEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="destructive">
              <Trash2 className="size-4" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Channel</DialogTitle>
              <DialogDescription>
                This will permanently remove the notification channel.
              </DialogDescription>
            </DialogHeader>
            <DeleteConfirmDialog
              channel={channel}
              onDeleted={() => setDeleteOpen(false)}
              onCancel={() => setDeleteOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Data Retention Section ──────────────────────────────────────────────────

function DataRetentionSection() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState("");

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const loaded = !isLoading && settings;
  const currentDays = settings?.retentionDays ?? "90";

  const saveMutation = useMutation({
    mutationFn: async (retentionDays: string) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Retention updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const runCleanupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cron/cleanup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "local-dev-secret"}`,
        },
      });
      if (!res.ok) throw new Error("Cleanup failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Pruned ${data.deleted} old check(s)`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const handleSave = () => {
    const val = parseInt(days || currentDays, 10);
    if (isNaN(val) || val < 1) {
      toast.error("Enter a positive number of days");
      return;
    }
    saveMutation.mutate(String(val));
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Data Retention</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check History Retention</CardTitle>
          <CardDescription>
            Checks older than this are automatically pruned daily.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="retention-days" className="font-mono">
                Retention (days)
              </Label>
              <Input
                id="retention-days"
                type="number"
                min={1}
                className="w-32 font-mono"
                placeholder={loaded ? currentDays : "90"}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => runCleanupMutation.mutate()}
              disabled={runCleanupMutation.isPending}
            >
              {runCleanupMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Run Cleanup Now
            </Button>
          </div>
          {loaded && (
            <p className="mt-2 text-xs text-muted-foreground">
              Currently keeping <span className="font-mono font-medium">{currentDays}</span> days of check history.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Heartbeat Interval Section ──────────────────────────────────────────────

function HeartbeatIntervalSection() {
  const queryClient = useQueryClient();
  const [seconds, setSeconds] = useState("");

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const loaded = !isLoading && settings;
  const currentInterval = settings?.defaultInterval ?? "120";

  const saveMutation = useMutation({
    mutationFn: async (interval: number) => {
      const [settingsRes, bulkRes] = await Promise.all([
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultInterval: String(interval) }),
        }),
        fetch("/api/monitors/bulk-interval", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: "all", interval }),
        }),
      ]);
      if (!settingsRes.ok) throw new Error("Failed to save setting");
      if (!bulkRes.ok) throw new Error("Failed to update monitors");
      return bulkRes.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`Updated ${data.updated} monitor(s) to new interval`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const handleSave = () => {
    const val = parseInt(seconds || currentInterval, 10);
    if (isNaN(val) || val < 10) {
      toast.error("Interval must be at least 10 seconds");
      return;
    }
    saveMutation.mutate(val);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Heartbeat Interval</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Check Interval</CardTitle>
          <CardDescription>
            Saving will update all existing monitors to the new interval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="heartbeat-interval" className="font-mono">
                Interval (seconds)
              </Label>
              <Input
                id="heartbeat-interval"
                type="number"
                min={10}
                className="w-32 font-mono"
                placeholder={loaded ? currentInterval : "120"}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Save &amp; Apply to All
            </Button>
          </div>
          {loaded && (
            <p className="mt-2 text-xs text-muted-foreground">
              Current default: <span className="font-mono font-medium">{currentInterval}s</span>
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Excluded Patterns Section ───────────────────────────────────────────────

function ExcludedPatternsSection() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newPattern, setNewPattern] = useState("");

  const { data: patterns, isLoading } = useQuery({
    queryKey: ["excluded-patterns"],
    queryFn: fetchPatterns,
  });

  const addMutation = useMutation({
    mutationFn: async (pattern: string) => {
      const res = await fetch("/api/excluded-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add pattern");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-patterns"] });
      toast.success("Pattern added");
      setNewPattern("");
      setAddOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/excluded-patterns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-patterns"] });
      toast.success("Pattern removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;
    addMutation.mutate(newPattern.trim());
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Excluded Patterns</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Add Pattern
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Excluded Pattern</DialogTitle>
              <DialogDescription>
                Customer names or URLs matching this pattern will be excluded during API sync.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pattern-input">Pattern</Label>
                <Input
                  id="pattern-input"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  placeholder="e.g. Blossman or https://..."
                  className="font-mono"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Matches by substring against customer names and URLs.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Add
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {!isLoading && (!patterns || patterns.length === 0) && (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">
              No excluded patterns yet. Use the button above to add one.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && patterns && patterns.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-2">
              {patterns.map((p) => (
                <Badge
                  key={p.id}
                  variant="secondary"
                  className="gap-1 font-mono text-xs py-1 px-2"
                >
                  {p.pattern}
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    disabled={deleteMutation.isPending}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ─── User Types & Helpers ────────────────────────────────────────────────────

interface AppUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

async function fetchUsers(): Promise<AppUser[]> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

// ─── User Form ──────────────────────────────────────────────────────────────

function UserForm({
  user,
  onSuccess,
  onCancel,
}: {
  user?: AppUser | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const isEditing = !!user;

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created");
      onSuccess();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, string> }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
      onSuccess();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!isEditing && !password) {
      toast.error("Password is required for new users");
      return;
    }
    if (password && password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (isEditing && user) {
      const data: Record<string, string> = { name: name.trim(), email: email.trim() };
      if (password) data.password = password;
      updateMutation.mutate({ id: user.id, data });
    } else {
      createMutation.mutate({ name: name.trim(), email: email.trim(), password });
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="user-name">Name</Label>
        <Input
          id="user-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-email">Email</Label>
        <Input
          id="user-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@company.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-password">
          {isEditing ? "New Password (leave blank to keep current)" : "Password"}
        </Label>
        <Input
          id="user-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isEditing ? "••••••" : "Min 6 characters"}
          required={!isEditing}
        />
      </div>
      <DialogFooter className="gap-2 sm:gap-0 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {isEditing ? "Save" : "Add User"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── User Management Section ────────────────────────────────────────────────

function UserManagementSection() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
      setDeleteUser(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Users</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
              <DialogDescription>
                Create a new user who can sign in to the dashboard.
              </DialogDescription>
            </DialogHeader>
            <UserForm
              user={null}
              onSuccess={() => setAddOpen(false)}
              onCancel={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {!isLoading && (!users || users.length === 0) && (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">
              No users yet. The default admin will be created on first login.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && users && users.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {users.map((u) => (
            <Card key={u.id} className="border-l-4 border-l-muted hover:border-l-primary/50 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground shrink-0" />
                    <CardTitle className="text-base truncate">{u.name}</CardTitle>
                  </div>
                  <CardDescription className="mt-1 text-xs font-mono">
                    {u.email}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2 px-4 pb-3 pt-0">
                <Dialog
                  open={editUser?.id === u.id}
                  onOpenChange={(open) => { if (!open) setEditUser(null); }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" onClick={() => setEditUser(u)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Edit User</DialogTitle>
                      <DialogDescription>
                        Update user details or reset their password.
                      </DialogDescription>
                    </DialogHeader>
                    <UserForm
                      user={u}
                      onSuccess={() => setEditUser(null)}
                      onCancel={() => setEditUser(null)}
                    />
                  </DialogContent>
                </Dialog>
                <Dialog
                  open={deleteUser?.id === u.id}
                  onOpenChange={(open) => { if (!open) setDeleteUser(null); }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteUser(u)}
                      disabled={(users?.length ?? 0) <= 1}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Delete User</DialogTitle>
                      <DialogDescription>
                        This will permanently remove &quot;{u.name}&quot; and they will no longer be able to sign in.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" onClick={() => setDeleteUser(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(u.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Settings Page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const { data: channels, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchChannels,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage notifications, retention, and exclusions</p>
      </div>

      {/* User Management */}
      <UserManagementSection />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Notification Channels */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Notification Channels</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Add Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Channel</DialogTitle>
              <DialogDescription>
                Create a new notification channel for alerts.
              </DialogDescription>
            </DialogHeader>
            <ChannelForm
              channel={null}
              onSuccess={() => setAddOpen(false)}
              onCancel={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-6">
            <p className="text-destructive">
              {error instanceof Error ? error.message : "Failed to load channels"}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && channels?.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">
              No notification channels yet. Use the button above to add one.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && channels && channels.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Heartbeat Interval */}
      <HeartbeatIntervalSection />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Data Retention */}
      <DataRetentionSection />

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Excluded Patterns */}
      <ExcludedPatternsSection />
    </div>
  );
}
