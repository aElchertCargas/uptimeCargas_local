"use client";

import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export interface ResponseChartDataPoint {
  checkedAt: string;
  responseTime: number;
}

interface ResponseChartProps {
  data: ResponseChartDataPoint[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 font-mono text-sm text-popover-foreground shadow-md">
      <div className="text-muted-foreground text-xs">{formatTime(label)}</div>
      <div className="font-medium text-primary">{payload[0].value} ms</div>
    </div>
  );
};

export function ResponseChart({ data }: ResponseChartProps) {
  const chartData = [...data].sort(
    (a, b) =>
      new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  );

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-border font-mono text-sm text-muted-foreground">
        No response data
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(0 0% 90%)"
            vertical={false}
          />
          <defs>
            <linearGradient
              id="responseGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="hsl(221 83% 53%)"
                stopOpacity={0.15}
              />
              <stop
                offset="100%"
                stopColor="hsl(221 83% 53%)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="checkedAt"
            tickFormatter={formatTime}
            tick={{ fill: "hsl(0 0% 45%)", fontSize: 11, fontFamily: "var(--font-dm-mono)" }}
            axisLine={{ stroke: "hsl(0 0% 85%)" }}
            tickLine={{ stroke: "hsl(0 0% 85%)" }}
            stroke="hsl(0 0% 85%)"
          />
          <YAxis
            tick={{ fill: "hsl(0 0% 45%)", fontSize: 11, fontFamily: "var(--font-dm-mono)" }}
            axisLine={{ stroke: "hsl(0 0% 85%)" }}
            tickLine={{ stroke: "hsl(0 0% 85%)" }}
            tickFormatter={(v) => `${v} ms`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="responseTime"
            fill="url(#responseGradient)"
            stroke="none"
          />
          <Line
            type="monotone"
            dataKey="responseTime"
            stroke="hsl(221 83% 53%)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "hsl(221 83% 53%)", stroke: "white", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
