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
    const [allIncidents, openIncidents] = await Promise.all([
      prisma.incident.findMany({
        include: {
          monitor: {
            select: { name: true },
          },
        },
        orderBy: { startedAt: "desc" },
      }),
      prisma.incident.count({
        where: { resolvedAt: null },
      }),
    ]);

    const resolvedIncidents = allIncidents.filter((i) => i.resolvedAt);
    const totalResolutionTime = resolvedIncidents.reduce((sum, incident) => {
      if (incident.resolvedAt) {
        const duration =
          (new Date(incident.resolvedAt).getTime() -
            new Date(incident.startedAt).getTime()) /
          1000 /
          60;
        return sum + duration;
      }
      return sum;
    }, 0);

    const averageResolutionTime =
      resolvedIncidents.length > 0
        ? totalResolutionTime / resolvedIncidents.length
        : 0;

    const monitorCounts = new Map<string, number>();
    allIncidents.forEach((incident) => {
      const name = incident.monitor.name;
      monitorCounts.set(name, (monitorCounts.get(name) || 0) + 1);
    });

    const byMonitor = Array.from(monitorCounts.entries())
      .map(([monitor, count]) => ({ monitor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentIncidents = allIncidents.slice(0, 10).map((incident) => {
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
      total: allIncidents.length,
      resolved: resolvedIncidents.length,
      open: openIncidents,
      averageResolutionTime,
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
