"use client";

import { useMemo } from "react";

interface ChartDataPoint {
  [key: string]: string | number;
  count: number;
}

interface TicketChartProps {
  data: ChartDataPoint[];
  dataKey: string;
}

export function TicketChart({ data, dataKey }: TicketChartProps) {
  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1);
  }, [data]);

  const colors = [
    "bg-purple-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-gray-500",
    "bg-blue-500",
    "bg-pink-500",
    "bg-yellow-500",
    "bg-teal-500",
  ];

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((item, index) => {
        const percentage = (item.count / maxCount) * 100;
        const label = item[dataKey] as string;

        return (
          <div key={index} className="group relative">
            {/* Text label - fixed z-index to stay on top */}
            <div className="relative z-20 mb-2 flex items-center justify-between">
              <span className="truncate text-sm font-medium" title={label}>
                {label}
              </span>
              <span className="ml-2 shrink-0 font-mono text-sm text-muted-foreground">
                count: {item.count}
              </span>
            </div>

            {/* Bar container with relative positioning */}
            <div className="relative h-8 w-full overflow-hidden rounded-md bg-muted">
              {/* Animated bar - lower z-index */}
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-500 ease-out",
                  colors[index % colors.length]
                )}
                style={{
                  width: `${percentage}%`,
                  zIndex: 10,
                }}
              />

              {/* Hover overlay */}
              <div className="absolute inset-0 z-10 bg-background/0 transition-colors group-hover:bg-background/10" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
