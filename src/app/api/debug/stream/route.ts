import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300; // 5 minutes for SSE connection

export async function GET(request: NextRequest) {
  if (!(await auth())?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Set up SSE headers
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastLogTimestamp: Date | null = null;
      let lastMonitorUpdate: Date = new Date(Date.now() - 5000); // 5 seconds ago
      let lastHeartbeatAt = Date.now();

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send initial data
      try {
        const [monitors, recentLogs] = await Promise.all([
          prisma.monitor.findMany({
            select: {
              id: true,
              name: true,
              url: true,
              active: true,
              interval: true,
              lastStatus: true,
              lastResponseTime: true,
              lastCheckedAt: true,
            },
            orderBy: { name: "asc" },
          }),
          prisma.debugLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
          }),
        ]);

        if (recentLogs.length > 0) {
          lastLogTimestamp = recentLogs[0].createdAt;
        }

        send({
          type: "init",
          monitors: monitors.map((m) => ({
            id: m.id,
            name: m.name,
            url: m.url,
            active: m.active,
            interval: m.interval,
            status: m.lastStatus,
            responseTime: m.lastResponseTime,
            lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
          })),
          logs: recentLogs.map((l) => ({
            id: l.id,
            type: l.type,
            monitor: l.monitor,
            channel: l.channel,
            message: l.message,
            createdAt: l.createdAt.toISOString(),
          })),
        });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
        controller.close();
        return;
      }

      // Poll for updates every 5 seconds to limit database load per client.
      const interval = setInterval(async () => {
        try {
          // Check for new debug logs
          const newLogs = await prisma.debugLog.findMany({
            where: lastLogTimestamp
              ? {
                  createdAt: { gt: lastLogTimestamp },
                }
              : undefined,
            orderBy: { createdAt: "asc" },
            take: 100,
          });

          if (newLogs.length > 0) {
            lastLogTimestamp = newLogs[newLogs.length - 1].createdAt;
            send({
              type: "logs",
              logs: newLogs.map((l) => ({
                id: l.id,
                type: l.type,
                monitor: l.monitor,
                channel: l.channel,
                message: l.message,
                createdAt: l.createdAt.toISOString(),
              })),
            });
          }

          // Check for monitor updates (check if updatedAt changed)
          const updatedMonitors = await prisma.monitor.findMany({
            where: {
              updatedAt: {
                gt: lastMonitorUpdate,
              },
            },
            select: {
              id: true,
              name: true,
              url: true,
              active: true,
              interval: true,
              lastStatus: true,
              lastResponseTime: true,
              lastCheckedAt: true,
            },
          });

          if (updatedMonitors.length > 0) {
            lastMonitorUpdate = new Date();
            send({
              type: "monitors",
              monitors: updatedMonitors.map((m) => ({
                id: m.id,
                name: m.name,
                url: m.url,
                active: m.active,
                interval: m.interval,
                status: m.lastStatus,
                responseTime: m.lastResponseTime,
                lastCheckedAt: m.lastCheckedAt?.toISOString() ?? null,
              })),
            });
          }

          if (Date.now() - lastHeartbeatAt >= 10_000) {
            lastHeartbeatAt = Date.now();
            send({ type: "heartbeat", timestamp: new Date().toISOString() });
          }
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
        }
      }, 5000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
