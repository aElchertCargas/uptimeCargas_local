import { NextRequest, NextResponse } from "next/server";
import {
  createZendeskTicketsForLongRunningIncidents,
  dispatchPendingAlertEvents,
  getZendeskSettings,
  queueDueDownAlertEvents,
  recordDownTransitions,
  resolveOrphanedIncidents,
  resolveRecoveryTransitions,
  type MonitorStateTransition,
} from "@/lib/alerting";
import { performCheck, runChecksInBatches } from "@/lib/checker";
import { withAdvisoryLock } from "@/lib/postgres-lock";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;
const CHECK_CYCLE_LOCK_ID = 4214001;

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

  const lockResult = await withAdvisoryLock(CHECK_CYCLE_LOCK_ID, async () => {
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
    const dueMonitors = monitors.filter((monitor) => {
      const lastCheck = monitor.checks[0];
      if (!lastCheck) {
        return true;
      }

      return now - lastCheck.checkedAt.getTime() >= monitor.interval * 1000;
    });

    const pendingInserts: CheckRecord[] = [];
    const stateChanges: MonitorStateTransition<(typeof dueMonitors)[number]>[] = [];

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
    const checkedIds = pendingInserts.map((record) => record.monitorId);

    if (checkedIds.length > 0) {
      const [allStats, upStats] = await Promise.all([
        prisma.check.groupBy({
          by: ["monitorId"],
          where: {
            monitorId: { in: checkedIds },
            checkedAt: { gte: twentyFourHoursAgo },
          },
          _count: { id: true },
          _avg: { responseTime: true },
        }),
        prisma.check.groupBy({
          by: ["monitorId"],
          where: {
            monitorId: { in: checkedIds },
            checkedAt: { gte: twentyFourHoursAgo },
            isUp: true,
          },
          _count: { id: true },
        }),
      ]);

      const allMap = new Map(
        allStats.map((stat) => [
          stat.monitorId,
          { total: stat._count.id, avg: stat._avg.responseTime ?? 0 },
        ])
      );
      const upMap = new Map(
        upStats.map((stat) => [stat.monitorId, stat._count.id])
      );

      await Promise.all(
        pendingInserts.map((record) => {
          const stats = allMap.get(record.monitorId);
          const upCount = upMap.get(record.monitorId) ?? 0;
          const total = stats?.total ?? 0;

          return prisma.monitor.update({
            where: { id: record.monitorId },
            data: {
              lastStatus: record.isUp,
              lastResponseTime: record.responseTime,
              lastCheckedAt: new Date(),
              uptime24h:
                total > 0 ? Math.round((upCount / total) * 10000) / 100 : null,
              avgResponseTime24h: stats ? Math.round(stats.avg) : null,
            },
          });
        })
      );
    }

    const zendeskSettings = await getZendeskSettings();

    await recordDownTransitions(stateChanges);
    const queuedDown = await queueDueDownAlertEvents(new Date());
    await resolveRecoveryTransitions(stateChanges, zendeskSettings, true);

    const recoveredMonitorIds = new Set(
      stateChanges
        .filter((transition) => transition.result.isUp)
        .map((transition) => transition.monitor.id)
    );
    await resolveOrphanedIncidents(zendeskSettings, recoveredMonitorIds);

    const alertDispatch = await dispatchPendingAlertEvents(new Date());
    const zendeskTicketsCreated = await createZendeskTicketsForLongRunningIncidents(
      new Date(),
      zendeskSettings
    );

    return {
      checked: pendingInserts.length,
      queuedDown,
      alertsProcessed: alertDispatch.processed,
      alertsSent: alertDispatch.sent,
      zendeskTicketsCreated,
      results: pendingInserts.map((record) => ({
        monitorId: record.monitorId,
        isUp: record.isUp,
        changed: stateChanges.some(
          (transition) => transition.monitor.id === record.monitorId
        ),
      })),
    };
  });

  if (!lockResult.acquired) {
    return NextResponse.json(
      {
        skipped: true,
        reason: "Another check cycle is already running.",
      },
      { status: 202 }
    );
  }

  return NextResponse.json(lockResult.result);
}
