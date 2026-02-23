"use client";

import { useState, useRef, useCallback, useMemo } from "react";
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
  isUp?: boolean;
}

interface ResponseChartProps {
  data: ResponseChartDataPoint[];
  onRangeSelect?: (from: string, to: string) => void;
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
const SELECTION_COLOR = "hsl(221 83% 53%)";

const CHART_MARGIN = { top: 8, right: 8, left: 60, bottom: 0 };

export function ResponseChart({ data, onRangeSelect }: ResponseChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStartIdx, setDragStartIdx] = useState<number | null>(null);
  const [dragEndIdx, setDragEndIdx] = useState<number | null>(null);
  const isDragging = useRef(false);

  const chartData = useMemo(
    () =>
      [...data].sort(
        (a, b) =>
          new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
      ),
    [data]
  );
  const downSegments = useMemo(() => getDownSegments(chartData), [chartData]);

  const xToIndex = useCallback(
    (clientX: number): number | null => {
      const el = containerRef.current;
      if (!el || chartData.length === 0) return null;
      const rect = el.getBoundingClientRect();
      const plotLeft = CHART_MARGIN.left;
      const plotRight = rect.width - CHART_MARGIN.right;
      const plotWidth = plotRight - plotLeft;
      if (plotWidth <= 0) return null;
      const relX = clientX - rect.left - plotLeft;
      const ratio = Math.max(0, Math.min(1, relX / plotWidth));
      return Math.round(ratio * (chartData.length - 1));
    },
    [chartData]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onRangeSelect) return;
      const idx = xToIndex(e.clientX);
      if (idx === null) return;
      isDragging.current = true;
      setDragStartIdx(idx);
      setDragEndIdx(idx);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [onRangeSelect, xToIndex]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const idx = xToIndex(e.clientX);
      if (idx !== null) setDragEndIdx(idx);
    },
    [xToIndex]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (dragStartIdx !== null && dragEndIdx !== null && dragStartIdx !== dragEndIdx && onRangeSelect) {
      const lo = Math.min(dragStartIdx, dragEndIdx);
      const hi = Math.max(dragStartIdx, dragEndIdx);
      onRangeSelect(chartData[lo].checkedAt, chartData[hi].checkedAt);
    }

    setDragStartIdx(null);
    setDragEndIdx(null);
  }, [dragStartIdx, dragEndIdx, onRangeSelect, chartData]);

  const selStart =
    dragStartIdx !== null && dragEndIdx !== null
      ? chartData[Math.min(dragStartIdx, dragEndIdx)]?.checkedAt
      : null;
  const selEnd =
    dragStartIdx !== null && dragEndIdx !== null
      ? chartData[Math.max(dragStartIdx, dragEndIdx)]?.checkedAt
      : null;

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-border font-mono text-sm text-muted-foreground">
        No response data
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={CHART_MARGIN}
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
            {selStart && selEnd && (
              <ReferenceArea
                x1={selStart}
                x2={selEnd}
                strokeOpacity={0}
                fill={SELECTION_COLOR}
                fillOpacity={0.2}
              />
            )}
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

      {onRangeSelect && (
        <div
          className="absolute inset-0 cursor-crosshair"
          style={{ left: CHART_MARGIN.left, right: CHART_MARGIN.right }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}

      {onRangeSelect && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Click and drag on the chart to filter checks to a time range
        </p>
      )}
    </div>
  );
}
