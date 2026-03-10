import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performCheck, runChecksInBatches, type CheckResult } from "@/lib/checker";
import {
  buildRecoveryNotificationPayload,
  dispatchNotification,
  writeDebugLog,
  type NotificationPayload,
} from "@/lib/notifications";

export const maxDuration = 120;

interface CheckRecord {
  monitorId: string;
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
}

async function sendNotifications(payload: NotificationPayload) {
  const channels = await prisma.notificationChannel.findMany({
    where: { enabled: true },
  });
  await Promise.allSettled(
    channels.map((ch) =>
      dispatchNotification(ch.type, ch.name, ch.config as Record<string, unknown>, payload)
    )
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const monitorIds: string[] = body.monitorIds;

  if (!Array.isArray(monitorIds) || monitorIds.length === 0) {
    return NextResponse.json(
      { error: "monitorIds must be a non-empty array" },
      { status: 400 }
    );
  }

  const monitors = await prisma.monitor.findMany({
    where: { id: { in: monitorIds } },
    include: {
      checks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
    },
  });

  const pendingInserts: CheckRecord[] = [];
  const stateChanges: { monitor: (typeof monitors)[number]; result: CheckResult }[] = [];

  await runChecksInBatches(monitors, async (monitor) => {
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
      stateChanges.push({ monitor, result });
    }
  });

  if (pendingInserts.length > 0) {
    await prisma.check.createMany({ data: pendingInserts });
  }

  const now = Date.now();
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

  // Handle state changes so manual "Check now" also creates/resolves incidents and sends notifications
  for (const { monitor, result } of stateChanges) {
    if (!result.isUp) {
      const existingOpen = await prisma.incident.findFirst({
        where: { monitorId: monitor.id, resolvedAt: null },
      });
      if (!existingOpen) {
        await prisma.incident.create({
          data: { monitorId: monitor.id, message: result.message },
        });
        await writeDebugLog("down", monitor.name, null, result.message ?? "Monitor went down");
      }
    }
  }

  for (const { monitor, result } of stateChanges) {
    if (result.isUp) {
      const openIncident = await prisma.incident.findFirst({
        where: { monitorId: monitor.id, resolvedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (!openIncident) continue;

      const resolvedAt = new Date();
      const notifiedAt = openIncident.notifiedAt ?? resolvedAt;
      const updateResult = await prisma.incident.updateMany({
        where: { id: openIncident.id, resolvedAt: null },
        data: { resolvedAt, notifiedAt },
      });
      if (updateResult.count === 0) continue;

      await writeDebugLog("up", monitor.name, null, `${monitor.name} recovered (${result.responseTime}ms)`);

      await sendNotifications(
        buildRecoveryNotificationPayload({
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          responseTimeMs: result.responseTime,
          incidentMessage: openIncident.message,
          startedAt: openIncident.startedAt,
          resolvedAt,
          alertWasSent: openIncident.notifiedAt !== null,
        })
      );
    }
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
