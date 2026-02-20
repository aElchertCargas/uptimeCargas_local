"use client";

import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export interface ResponseChartDataPoint {
  checkedAt: string;
  responseTime: number;
  /** When false, the point is shown as a red dot (failed fetch). */
  isUp?: boolean;
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
  payload?: Array<{ value: number; payload?: ResponseChartDataPoint }>;
  label?: string;
}) => {
  if (!active || !payload?.length || !label) return null;
  const point = payload[0].payload;
  const failed = point?.isUp === false;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 font-mono text-sm text-popover-foreground shadow-md">
      <div className="text-muted-foreground text-xs">{formatTime(label)}</div>
      <div className={failed ? "font-medium text-[var(--color-status-down)]" : "font-medium text-primary"}>
        {failed ? "Down" : `${payload[0].value} ms`}
      </div>
      {failed && point?.responseTime != null && point.responseTime > 0 && (
        <div className="text-muted-foreground text-xs">Failed after {point.responseTime} ms</div>
      )}
    </div>
  );
};

/** Returns segments of consecutive down points [startCheckedAt, endCheckedAt]. */
function getDownSegments(sortedData: ResponseChartDataPoint[]): { x1: string; x2: string }[] {
  const segments: { x1: string; x2: string }[] = [];
  let segmentStart: string | null = null;
  for (let i = 0; i < sortedData.length; i++) {
    const point = sortedData[i];
    const isDown = point.isUp === false;
    if (isDown) {
      if (segmentStart === null) segmentStart = point.checkedAt;
    } else {
      if (segmentStart !== null) {
        const lastDown = sortedData[i - 1];
        segments.push({ x1: segmentStart, x2: lastDown!.checkedAt });
        segmentStart = null;
      }
    }
  }
  if (segmentStart !== null && sortedData.length > 0) {
    const last = sortedData[sortedData.length - 1];
    segments.push({ x1: segmentStart, x2: last.checkedAt });
  }
  return segments;
}

const DOWN_COLOR = "var(--color-status-down)";

export function ResponseChart({ data }: ResponseChartProps) {
  const chartData = [...data].sort(
    (a, b) =>
      new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  );
  const downSegments = getDownSegments(chartData);

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
          {downSegments.map((seg, i) => (
            <ReferenceArea
              key={`${seg.x1}-${seg.x2}-${i}`}
              x1={seg.x1}
              x2={seg.x2}
              strokeOpacity={0}
              fill={DOWN_COLOR}
              fillOpacity={0.2}
            />
          ))}
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
            dot={({ cx, cy, payload }) => {
              if (cx == null || cy == null) return null;
              const failed = payload?.isUp === false;
              const r = 4;
              const fill = failed ? DOWN_COLOR : "hsl(221 83% 53%)";
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={(props) => {
              const { cx, cy, payload } = props;
              const failed = payload?.isUp === false;
              const r = 5;
              const fill = failed ? DOWN_COLOR : "hsl(221 83% 53%)";
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke="white"
                  strokeWidth={2}
                />
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
