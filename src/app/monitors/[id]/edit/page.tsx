"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const METHODS = ["GET", "HEAD", "POST", "PUT"] as const;

function parseStatusCodes(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 100 && n <= 599);
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
}

export default function EditMonitorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    url: string;
    method: (typeof METHODS)[number];
    interval: string;
    timeout: string;
    expectedStatus: string;
    tags: string;
  } | null>(null);

  const { data: monitor, isLoading } = useQuery<Monitor>({
    queryKey: ["monitor", id],
    queryFn: async () => {
      const res = await fetch(`/api/monitors/${id}`);
      if (!res.ok) throw new Error("Failed to fetch monitor");
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (monitor) {
      const statuses = Array.isArray(monitor.expectedStatus)
        ? monitor.expectedStatus
        : [monitor.expectedStatus];
      setForm({
        name: monitor.name,
        url: monitor.url,
        method: (METHODS.includes(monitor.method as (typeof METHODS)[number])
          ? monitor.method
          : "GET") as (typeof METHODS)[number],
        interval: String(monitor.interval),
        timeout: String(monitor.timeout),
        expectedStatus: statuses.join(", "),
        tags: monitor.tags?.join(", ") ?? "",
      });
    }
  }, [monitor]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !form.name.trim() || !form.url.trim()) {
      toast.error("Name and URL are required");
      return;
    }
    const codes = parseStatusCodes(form.expectedStatus);
    if (codes.length === 0) {
      toast.error("At least one valid status code is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/monitors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim(),
          method: form.method,
          interval: parseInt(form.interval, 10) || 120,
          timeout: parseInt(form.timeout, 10) || 48,
          expectedStatus: codes,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update monitor");
      }
      toast.success("Monitor updated");
      router.push(`/monitors/${id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update monitor"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !monitor || !form) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/monitors/${id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to monitor
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono">Edit Monitor</CardTitle>
          <CardDescription>Update monitor settings</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-mono">
                Name *
              </Label>
              <Input
                id="name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="My API"
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url" className="font-mono">
                URL *
              </Label>
              <Input
                id="url"
                name="url"
                type="url"
                value={form.url}
                onChange={handleChange}
                placeholder="https://example.com/health"
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="method" className="font-mono">
                Method
              </Label>
              <Select
                value={form.method}
                onValueChange={(v) =>
                  setForm((prev) =>
                    prev ? { ...prev, method: v as (typeof METHODS)[number] } : prev
                  )
                }
              >
                <SelectTrigger id="method" className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m} className="font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="interval" className="font-mono">
                  Check interval (seconds)
                </Label>
                <Input
                  id="interval"
                  name="interval"
                  type="number"
                  min={1}
                  value={form.interval}
                  onChange={handleChange}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeout" className="font-mono">
                  Timeout (seconds)
                </Label>
                <Input
                  id="timeout"
                  name="timeout"
                  type="number"
                  min={1}
                  value={form.timeout}
                  onChange={handleChange}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedStatus" className="font-mono">
                  Accepted status codes
                </Label>
                <Input
                  id="expectedStatus"
                  name="expectedStatus"
                  value={form.expectedStatus}
                  onChange={handleChange}
                  placeholder="200, 401"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags" className="font-mono">
                Tags (comma-separated)
              </Label>
              <Input
                id="tags"
                name="tags"
                value={form.tags}
                onChange={handleChange}
                placeholder="api, production"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                Save
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/monitors/${id}`}>Cancel</Link>
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="ml-auto"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete monitor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{monitor.name}&quot;? This
              action cannot be undone.
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
    </div>
  );
}
