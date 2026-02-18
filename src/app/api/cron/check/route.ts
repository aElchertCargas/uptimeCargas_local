import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performCheck, runChecksInBatches, type CheckResult } from "@/lib/checker";
import { dispatchNotification, type NotificationPayload } from "@/lib/notifications";

export const maxDuration = 120;

interface CheckRecord {
  monitorId: string;
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monitors = await prisma.monitor.findMany({
    where: { active: true },
    include: {
      checks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
    },
  });

  const now = Date.now();
  const dueMonitors = monitors.filter((m) => {
    const lastCheck = m.checks[0];
    if (!lastCheck) return true;
    return now - lastCheck.checkedAt.getTime() >= m.interval * 1000;
  });

  const pendingInserts: CheckRecord[] = [];
  const stateChanges: { monitor: typeof dueMonitors[number]; result: CheckResult; previouslyUp: boolean }[] = [];

  await runChecksInBatches(dueMonitors, async (monitor) => {
    const result = await performCheck(
      monitor.url,
      monitor.method,
      monitor.timeout,
      monitor.expectedStatus,
      monitor.maxRetries
    );

    pendingInserts.push({
      monitorId: monitor.id,
      status: result.status,
      responseTime: result.responseTime,
      isUp: result.isUp,
      message: result.message,
    });

    const previouslyUp = monitor.checks[0]?.isUp ?? true;
    if (previouslyUp !== result.isUp) {
      stateChanges.push({ monitor, result, previouslyUp });
    }
  });

  if (pendingInserts.length > 0) {
    await prisma.check.createMany({ data: pendingInserts });
  }

  // Update materialized stats on monitors
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  const checkedIds = pendingInserts.map((r) => r.monitorId);

  if (checkedIds.length > 0) {
    const [allStats, upStats] = await Promise.all([
      prisma.check.groupBy({
        by: ["monitorId"],
        where: { monitorId: { in: checkedIds }, checkedAt: { gte: twentyFourHoursAgo } },
        _count: { id: true },
        _avg: { responseTime: true },
      }),
      prisma.check.groupBy({
        by: ["monitorId"],
        where: { monitorId: { in: checkedIds }, checkedAt: { gte: twentyFourHoursAgo }, isUp: true },
        _count: { id: true },
      }),
    ]);

    const allMap = new Map(allStats.map((s) => [s.monitorId, { total: s._count.id, avg: s._avg.responseTime ?? 0 }]));
    const upMap = new Map(upStats.map((s) => [s.monitorId, s._count.id]));

    await Promise.all(
      pendingInserts.map((r) => {
        const stats = allMap.get(r.monitorId);
        const upCount = upMap.get(r.monitorId) ?? 0;
        const total = stats?.total ?? 0;

        return prisma.monitor.update({
          where: { id: r.monitorId },
          data: {
            lastStatus: r.isUp,
            lastResponseTime: r.responseTime,
            lastCheckedAt: new Date(),
            uptime24h: total > 0 ? Math.round((upCount / total) * 10000) / 100 : null,
            avgResponseTime24h: stats ? Math.round(stats.avg) : null,
          },
        });
      })
    );
  }

  for (const { monitor, result } of stateChanges) {
    if (!result.isUp) {
      await prisma.incident.create({
        data: { monitorId: monitor.id, message: result.message },
      });
    } else {
      const openIncident = await prisma.incident.findFirst({
        where: { monitorId: monitor.id, resolvedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (openIncident) {
        await prisma.incident.update({
          where: { id: openIncident.id },
          data: { resolvedAt: new Date() },
        });
      }
    }

    const channels = await prisma.notificationChannel.findMany({
      where: { enabled: true },
    });

    const payload: NotificationPayload = {
      monitorName: monitor.name,
      monitorUrl: monitor.url,
      status: result.isUp ? "up" : "down",
      message: result.isUp
        ? `${monitor.name} is back UP (${result.responseTime}ms)`
        : `${monitor.name} is DOWN: ${result.message}`,
      timestamp: new Date().toISOString(),
    };

    await Promise.allSettled(
      channels.map((ch) =>
        dispatchNotification(ch.type, ch.config as Record<string, unknown>, payload)
      )
    );
  }

  return NextResponse.json({
    checked: pendingInserts.length,
    results: pendingInserts.map((r) => ({
      monitorId: r.monitorId,
      isUp: r.isUp,
      changed: stateChanges.some((sc) => sc.monitor.id === r.monitorId),
    })),
  });
}
