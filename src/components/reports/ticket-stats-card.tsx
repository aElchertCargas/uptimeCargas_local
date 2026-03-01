"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TicketStatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  variant?: "default" | "success" | "warning";
}

export function TicketStatsCard({
  title,
  value,
  description,
  variant = "default",
}: TicketStatsCardProps) {
  return (
    <Card
      className={cn(
        "transition-shadow",
        variant === "warning" && "border-orange-500/50",
        variant === "success" && "border-green-500/50"
      )}
    >
      <CardHeader className="pb-2">
        <span className="text-sm font-medium text-muted-foreground">
          {title}
        </span>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <span
            className={cn(
              "font-mono text-2xl font-semibold tracking-tight",
              variant === "warning" && "text-orange-500",
              variant === "success" && "text-green-500"
            )}
          >
            {value}
          </span>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
