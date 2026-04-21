import { NextRequest, NextResponse } from "next/server";
import {
  dispatchPendingAlertEvents,
  getZendeskSettings,
  protectDownTransitionsForIncidentCreation,
  queueDueDownAlertEvents,
  recordDownTransitions,
  resolveRecoveryTransitions,
  type MonitorStateTransition,
} from "@/lib/alerting";
import { prisma } from "@/lib/prisma";
import { performCheck, runChecksInBatches } from "@/lib/checker";

export const maxDuration = 120;

interface CheckRecord {
  monitorId: string;
  status: number;
  responseTime: number;
  isUp: boolean;
  message: string | null;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const monitorIds: string[] = body.monitorIds;
  const sendAlerts = body.sendAlerts === true;

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
  const stateChanges: MonitorStateTransition<(typeof monitors)[number]>[] = [];

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
      stateChanges.push({ monitor, result, previouslyUp });
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

  const zendeskSettings = await getZendeskSettings();
  const downProtection = await protectDownTransitionsForIncidentCreation(
    "manual-check",
    monitors.length,
    stateChanges
  );

  await recordDownTransitions(downProtection.downTransitionsForIncidents);

  if (sendAlerts) {
    await queueDueDownAlertEvents(new Date());
  }
  await resolveRecoveryTransitions(stateChanges, zendeskSettings, sendAlerts);

  let alertsProcessed = 0;
  let alertsSent = 0;
  if (sendAlerts) {
    const dispatchSummary = await dispatchPendingAlertEvents(new Date());
    alertsProcessed = dispatchSummary.processed;
    alertsSent = dispatchSummary.sent;
  }

  return NextResponse.json({
    checked: pendingInserts.length,
    sendAlerts,
    alertsProcessed,
    alertsSent,
    suppression: downProtection.suppression,
    results: pendingInserts.map((r) => ({
      monitorId: r.monitorId,
      isUp: r.isUp,
      changed: stateChanges.some((sc) => sc.monitor.id === r.monitorId),
    })),
  });
}
