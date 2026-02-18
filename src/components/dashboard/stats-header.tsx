"use client";

import { Activity, CheckCircle2, XCircle, Monitor } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatsSummary {
  total: number;
  active: number;
  up: number;
  down: number;
}

interface StatsHeaderProps {
  summary: StatsSummary;
}

const statCards: {
  key: keyof StatsSummary;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass?: string;
  glowClass?: string;
  pulseClass?: string;
}[] = [
  { key: "total", label: "Total Monitors", icon: Monitor },
  { key: "active", label: "Active", icon: Activity },
  { key: "up", label: "Up", icon: CheckCircle2, colorClass: "text-[var(--color-status-up)]" },
  {
    key: "down",
    label: "Down",
    icon: XCircle,
    colorClass: "text-[var(--color-status-down)]",
    glowClass: "glow-down",
    pulseClass: "animate-pulse-down",
  },
];

export function StatsHeader({ summary }: StatsHeaderProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map(({ key, label, icon: Icon, colorClass, glowClass, pulseClass }) => {
        const count = summary[key];
        const isDownCard = key === "down";
        const showAlert = isDownCard && count > 0;

        return (
          <Card
            key={key}
            className={cn(
              "transition-shadow",
              showAlert && glowClass,
              showAlert && pulseClass
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <span className="text-muted-foreground text-sm font-medium">
                {label}
              </span>
              <Icon className={cn("size-4", colorClass)} />
            </CardHeader>
            <CardContent>
              <span className="font-mono text-2xl font-semibold tracking-tight">
                {count}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
