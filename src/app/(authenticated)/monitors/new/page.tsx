"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";

const METHODS = ["GET", "HEAD", "POST", "PUT"] as const;

function parseStatusCodes(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 100 && n <= 599);
}

export default function NewMonitorPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "",
    method: "GET" as (typeof METHODS)[number],
    interval: "120",
    timeout: "48",
    expectedStatus: "200, 401",
    tags: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) {
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
      const res = await fetch("/api/monitors", {
        method: "POST",
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
        throw new Error(err.error ?? "Failed to create monitor");
      }
      toast.success("Monitor created");
      router.push("/");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create monitor"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono">New Monitor</CardTitle>
          <CardDescription>Add a new endpoint to monitor</CardDescription>
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
                  setForm((prev) => ({ ...prev, method: v as (typeof METHODS)[number] }))
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
                Create
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
