import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performCheck, runChecksInBatches, type CheckResult } from "@/lib/checker";
import { dispatchNotification, writeDebugLog, type NotificationPayload } from "@/lib/notifications";
import { createZendeskTicket, updateZendeskTicket } from "@/lib/zendesk";

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

interface ZendeskSettings {
  enabled: boolean;
  subdomain: string;
  email: string;
  apiToken: string;
  groupId: string;
  delayMinutes: number;
  subjectTemplate: string;
  bodyTemplate: string;
}

interface IncidentWithMonitor {
  id: string;
  startedAt: Date;
  message: string | null;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
  zendeskTicketId: string | null;
  monitorId: string;
  monitor: {
    name: string;
    url: string;
  };
}

async function getZendeskSettings(): Promise<ZendeskSettings> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "zendeskEnabled",
          "zendeskSubdomain",
          "zendeskEmail",
          "zendeskApiToken",
          "zendeskGroupId",
          "zendeskTicketDelayMinutes",
          "zendeskSubjectTemplate",
          "zendeskBodyTemplate",
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    enabled: map.get("zendeskEnabled") === "true",
    subdomain: map.get("zendeskSubdomain") ?? "",
    email: map.get("zendeskEmail") ?? "",
    apiToken: map.get("zendeskApiToken") ?? "",
    groupId: map.get("zendeskGroupId") ?? "",
    delayMinutes: parseInt(map.get("zendeskTicketDelayMinutes") ?? "30", 10) || 30,
    subjectTemplate:
      map.get("zendeskSubjectTemplate") ??
      "{{monitorName}} is DOWN ({{downtimeMinutes}} min)",
    bodyTemplate:
      map.get("zendeskBodyTemplate") ??
      "Monitor: {{monitorName}}\nURL: {{monitorUrl}}\nDown since: {{timestamp}}\nDuration: {{downtimeMinutes}} minutes\n\nError: {{message}}",
  };
}

function hasZendeskConfig(settings: ZendeskSettings): boolean {
  return Boolean(
    settings.enabled &&
      settings.subdomain &&
      settings.email &&
      settings.apiToken &&
      settings.groupId
  );
}

async function addZendeskRecoveryUpdate(
  incident: IncidentWithMonitor,
  zendeskSettings: ZendeskSettings,
  resolvedAt: Date,
  responseTimeMs: number
) {
  if (!incident.zendeskTicketId || !hasZendeskConfig(zendeskSettings)) {
    return;
  }

  const downtimeMinutes = Math.max(
    1,
    Math.round((resolvedAt.getTime() - incident.startedAt.getTime()) / 60000)
  );
  const updated = await updateZendeskTicket(
    {
      subdomain: zendeskSettings.subdomain,
      email: zendeskSettings.email,
      apiToken: zendeskSettings.apiToken,
      groupId: zendeskSettings.groupId,
    },
    incident.zendeskTicketId,
    {
      monitorName: incident.monitor.name,
      monitorUrl: incident.monitor.url,
      message: incident.message ?? "No error details available",
      downTimestamp: incident.startedAt.toISOString(),
      recoveredTimestamp: resolvedAt.toISOString(),
      downtimeMinutes,
      responseTimeMs,
    }
  );

  const ticketUrl = `https://${zendeskSettings.subdomain}.zendesk.com/agent/tickets/${incident.zendeskTicketId}`;
  await writeDebugLog(
    updated ? "zendesk_ticket" : "zendesk_ticket_failed",
    incident.monitor.name,
    "zendesk",
    updated
      ? `Zendesk ticket #${incident.zendeskTicketId} updated with recovery note — ${ticketUrl}`
      : `Failed to update Zendesk ticket #${incident.zendeskTicketId} with recovery note — ${ticketUrl}`
  ).catch(() => {});
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

  // Create incidents for new down events only when there's no open incident
  // (one DOWN per contiguous downtime; no duplicate alerts while still down)
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

  // Send delayed down notifications BEFORE resolving recoveries so that
  // incidents resolved in this same cycle still get notifiedAt set first,
  // allowing the recovery handler to send the UP notification.
  const alertDelay = await getAlertDelay();
  const zendeskSettings = await getZendeskSettings();
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

  // Handle recoveries — only one run may resolve and send UP (atomic update).
  // Send belated DOWN + UP if the delay hadn't fired yet so short outages aren't swallowed.
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

      if (updateResult.count === 0) continue; // another run already resolved — only one UP per incident

      await addZendeskRecoveryUpdate(
        {
          ...openIncident,
          monitor: {
            name: monitor.name,
            url: monitor.url,
          },
        },
        zendeskSettings,
        resolvedAt,
        result.responseTime
      );

      await writeDebugLog("up", monitor.name, null, `${monitor.name} recovered (${result.responseTime}ms)`);

      if (!openIncident.notifiedAt) {
        await sendNotifications({
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          status: "down",
          message: `${monitor.name} was DOWN: ${openIncident.message} (recovered after ${Math.round((resolvedAt.getTime() - openIncident.startedAt.getTime()) / 1000)}s)`,
          timestamp: openIncident.startedAt.toISOString(),
        });
        // Small delay to ensure DOWN notification arrives before UP notification
        // when both are sent in the same batch (prevents out-of-order alerts)
        await new Promise((resolve) => setTimeout(resolve, 200));
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

  // Orphaned incident recovery: catch incidents missed when two concurrent scheduler
  // instances both read monitor state before either commits results. The first instance
  // correctly records DOWN; the second sees no state change (previouslyUp == isUp == UP)
  // and skips the recovery loop entirely. This pass queries DB state after all writes
  // are committed, so it always sees the true current state.
  const orphanedIncidents = await prisma.incident.findMany({
    where: { resolvedAt: null },
    include: {
      monitor: {
        include: { checks: { orderBy: { checkedAt: "desc" }, take: 1 } },
      },
    },
  });

  for (const incident of orphanedIncidents) {
    const latestCheck = incident.monitor.checks[0];
    if (!latestCheck?.isUp) continue; // monitor still down, not an orphan yet
    // Skip monitors already handled by the stateChanges recovery loop above
    const alreadyHandled = stateChanges.some(
      (sc) => sc.monitor.id === incident.monitorId && sc.result.isUp
    );
    if (alreadyHandled) continue;

    const resolvedAt = latestCheck.checkedAt;
    const notifiedAt = incident.notifiedAt ?? resolvedAt;
    const updateResult = await prisma.incident.updateMany({
      where: { id: incident.id, resolvedAt: null },
      data: { resolvedAt, notifiedAt },
    });
    if (updateResult.count === 0) continue; // concurrent run resolved it first

    await addZendeskRecoveryUpdate(
      incident,
      zendeskSettings,
      resolvedAt,
      latestCheck.responseTime
    );

    await writeDebugLog(
      "up",
      incident.monitor.name,
      null,
      `${incident.monitor.name} recovered (orphaned incident resolved)`
    );

    if (!incident.notifiedAt) {
      const duration = Math.round(
        (resolvedAt.getTime() - incident.startedAt.getTime()) / 1000
      );
      await sendNotifications({
        monitorName: incident.monitor.name,
        monitorUrl: incident.monitor.url,
        status: "down",
        message: `${incident.monitor.name} was DOWN: ${incident.message} (recovered after ${duration}s)`,
        timestamp: incident.startedAt.toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await sendNotifications({
      monitorName: incident.monitor.name,
      monitorUrl: incident.monitor.url,
      status: "up",
      message: `${incident.monitor.name} is back UP (${latestCheck.responseTime}ms)`,
      timestamp: resolvedAt.toISOString(),
    });
  }

  // Create Zendesk tickets for long-running incidents that don't have one yet.
  let zendeskTicketsCreated = 0;
  if (hasZendeskConfig(zendeskSettings)) {
    const zendeskCutoff = new Date(
      now - zendeskSettings.delayMinutes * 60 * 1000
    );
    
    // Get the timestamp when Zendesk was last enabled to avoid creating tickets for old incidents
    const zendeskEnabledSetting = await prisma.appSetting.findUnique({
      where: { key: "zendeskEnabledAt" },
    });
    const zendeskEnabledAt = zendeskEnabledSetting 
      ? new Date(zendeskEnabledSetting.value)
      : new Date(0); // If not set, allow all incidents (first-time setup)
    
    const unticketedIncidents = await prisma.incident.findMany({
      where: {
        resolvedAt: null,
        zendeskTicketId: null,
        startedAt: { 
          lte: zendeskCutoff,
          gte: zendeskEnabledAt, // Only incidents after Zendesk was enabled
        },
      },
      include: { monitor: true },
    });

    for (const incident of unticketedIncidents) {
      const downtimeMinutes = Math.floor(
        (now - incident.startedAt.getTime()) / 60000
      );
      const ticketId = await createZendeskTicket(
        {
          subdomain: zendeskSettings.subdomain,
          email: zendeskSettings.email,
          apiToken: zendeskSettings.apiToken,
          groupId: zendeskSettings.groupId,
        },
        zendeskSettings.subjectTemplate,
        zendeskSettings.bodyTemplate,
        {
          monitorName: incident.monitor.name,
          monitorUrl: incident.monitor.url,
          message: incident.message ?? "No error details available",
          timestamp: incident.startedAt.toISOString(),
          downtimeMinutes,
        }
      );

      if (ticketId) {
        await prisma.incident.update({
          where: { id: incident.id },
          data: { zendeskTicketId: ticketId },
        });
        const ticketUrl = `https://${zendeskSettings.subdomain}.zendesk.com/agent/tickets/${ticketId}`;
        await writeDebugLog(
          "zendesk_ticket",
          incident.monitor.name,
          "zendesk",
          `Zendesk ticket #${ticketId} created after ${downtimeMinutes} min of downtime — ${ticketUrl}`
        ).catch(() => {});
        zendeskTicketsCreated++;
      }
    }
  }

  return NextResponse.json({
    checked: pendingInserts.length,
    notified: pendingIncidents.length,
    zendeskTicketsCreated,
    results: pendingInserts.map((r) => ({
      monitorId: r.monitorId,
      isUp: r.isUp,
      changed: stateChanges.some((sc) => sc.monitor.id === r.monitorId),
    })),
  });
}
