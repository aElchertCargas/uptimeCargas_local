import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getIncidentZendeskStatus } from "@/lib/incident-zendesk-status";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [total, resolved, open, byMonitorRows, resolutionRows, incidents] =
      await Promise.all([
        prisma.incident.count(),
        prisma.incident.count({ where: { resolvedAt: { not: null } } }),
        prisma.incident.count({ where: { resolvedAt: null } }),
        prisma.incident.groupBy({
          by: ["monitorId"],
          _count: { id: true },
          orderBy: { _count: { id: "desc" } },
          take: 10,
        }),
        prisma.$queryRaw<Array<{ average_minutes: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "startedAt")) / 60) AS average_minutes
          FROM "Incident"
          WHERE "resolvedAt" IS NOT NULL
        `,
        prisma.incident.findMany({
          take: 10,
          include: { monitor: { select: { name: true } } },
          orderBy: { startedAt: "desc" },
        }),
      ]);

    const monitorIds = byMonitorRows.map((row) => row.monitorId);
    const monitors = await prisma.monitor.findMany({
      where: { id: { in: monitorIds } },
      select: { id: true, name: true },
    });
    const monitorNames = new Map(monitors.map((monitor) => [monitor.id, monitor.name]));
    const byMonitor = byMonitorRows.map((row) => ({
      monitor: monitorNames.get(row.monitorId) ?? row.monitorId,
      count: row._count.id,
    }));

    const recentIncidents = incidents.map((incident) => {
      const zendeskStatus = getIncidentZendeskStatus({
        resolvedAt: incident.resolvedAt,
        zendeskTicketId: incident.zendeskTicketId,
        zendeskRecoveryStatus: incident.zendeskRecoveryStatus,
      });

      return {
        id: incident.id,
        monitorName: incident.monitor.name,
        startedAt: incident.startedAt.toISOString(),
        resolvedAt: incident.resolvedAt?.toISOString() || null,
        duration: incident.resolvedAt
          ? (new Date(incident.resolvedAt).getTime() -
              new Date(incident.startedAt).getTime()) /
            1000 /
            60
          : null,
        message: incident.message,
        zendeskTicketId: incident.zendeskTicketId,
        zendeskStatus: zendeskStatus.label,
        zendeskStatusKey: zendeskStatus.key,
        zendeskStatusDescription: zendeskStatus.description,
      };
    });

    return NextResponse.json({
      total,
      resolved,
      open,
      averageResolutionTime: Number(resolutionRows[0]?.average_minutes ?? 0),
      byUser: [],
      byMonitor,
      recentIncidents,
    });
  } catch (error) {
    console.error("Failed to fetch ticket stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
