import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performCheck, runChecksInBatches, type CheckResult } from "@/lib/checker";
import { dispatchNotification, writeDebugLog, type NotificationPayload } from "@/lib/notifications";

export const maxDuration = 120;

interface CheckRecord {
  monitorId: string;
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
}

async function getAlertDelay(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "alertDelaySeconds" },
  });
  return row ? parseInt(row.value, 10) || 300 : 300;
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

  // Create incidents for new down events (before delayed send so they're eligible)
  for (const { monitor, result } of stateChanges) {
    if (!result.isUp) {
      await prisma.incident.create({
        data: { monitorId: monitor.id, message: result.message },
      });
      await writeDebugLog("down", monitor.name, null, result.message ?? "Monitor went down");
    }
  }

  // Send delayed down notifications BEFORE resolving recoveries so that
  // incidents resolved in this same cycle still get notifiedAt set first,
  // allowing the recovery handler to send the UP notification.
  const alertDelay = await getAlertDelay();
  const delayCutoff = new Date(now - alertDelay * 1000);

  const pendingIncidents = await prisma.incident.findMany({
    where: {
      resolvedAt: null,
      notifiedAt: null,
      startedAt: { lte: delayCutoff },
    },
    include: { monitor: true },
  });

  for (const incident of pendingIncidents) {
    await sendNotifications({
      monitorName: incident.monitor.name,
      monitorUrl: incident.monitor.url,
      status: "down",
      message: `${incident.monitor.name} is DOWN: ${incident.message}`,
      timestamp: new Date().toISOString(),
    });

    await prisma.incident.update({
      where: { id: incident.id },
      data: { notifiedAt: new Date() },
    });
  }

  // Handle recoveries — send both DOWN and UP if the delay hadn't fired yet,
  // so short-lived outages are never silently swallowed.
  for (const { monitor, result } of stateChanges) {
    if (result.isUp) {
      const openIncident = await prisma.incident.findFirst({
        where: { monitorId: monitor.id, resolvedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (openIncident) {
        const resolvedAt = new Date();
        await prisma.incident.update({
          where: { id: openIncident.id },
          data: { resolvedAt, notifiedAt: openIncident.notifiedAt ?? resolvedAt },
        });
        await writeDebugLog("up", monitor.name, null, `${monitor.name} recovered (${result.responseTime}ms)`);

        if (!openIncident.notifiedAt) {
          await sendNotifications({
            monitorName: monitor.name,
            monitorUrl: monitor.url,
            status: "down",
            message: `${monitor.name} was DOWN: ${openIncident.message} (recovered after ${Math.round((resolvedAt.getTime() - openIncident.startedAt.getTime()) / 1000)}s)`,
            timestamp: openIncident.startedAt.toISOString(),
          });
        }

        await sendNotifications({
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          status: "up",
          message: `${monitor.name} is back UP (${result.responseTime}ms)`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return NextResponse.json({
    checked: pendingInserts.length,
    notified: pendingIncidents.length,
    results: pendingInserts.map((r) => ({
      monitorId: r.monitorId,
      isUp: r.isUp,
      changed: stateChanges.some((sc) => sc.monitor.id === r.monitorId),
    })),
  });
}
