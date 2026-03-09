import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkSslCertificate, parseSslTarget } from "@/lib/ssl-checker";
import { dispatchNotification, writeDebugLog, type NotificationPayload } from "@/lib/notifications";

export const maxDuration = 120;

async function getSslAlertDays(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "sslAlertDays" },
  });
  return row ? parseInt(row.value, 10) || 1 : 1;
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
  });

  const httpsMonitors = monitors.flatMap((monitor) => {
    const target = parseSslTarget(monitor.url);
    return target ? [{ monitor, target }] : [];
  });
  const alertDays = await getSslAlertDays();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86_400_000);

  let checked = 0;
  let alerted = 0;

  for (const { monitor, target } of httpsMonitors) {
    const displayName = target.displayName;

    if (monitor.sslLastCheckedAt && monitor.sslLastCheckedAt > oneDayAgo) {
      continue;
    }

    const result = await checkSslCertificate(target);

    if (!result) continue;

    checked++;

    if (result.error) {
      await prisma.monitor.update({
        where: { id: monitor.id },
        data: { sslLastCheckedAt: now },
      });
      await writeDebugLog(
        "ssl_error",
        monitor.name,
        null,
        `SSL check failed for ${displayName}: ${result.error}`
      );
      continue;
    }

    await prisma.monitor.update({
      where: { id: monitor.id },
      data: {
        sslExpiresAt: result.expiresAt,
        sslIssuer: result.issuer,
        sslLastCheckedAt: now,
      },
    });

    if (result.daysRemaining <= alertDays) {
      const previousExpiry = monitor.sslExpiresAt?.toISOString();
      const currentExpiry = result.expiresAt.toISOString();
      const alreadyNotifiedSameCert = previousExpiry === currentExpiry
        && monitor.sslLastCheckedAt
        && monitor.sslLastCheckedAt > oneDayAgo;

      if (!alreadyNotifiedSameCert) {
        const expiryDate = result.expiresAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const message = result.daysRemaining <= 0
          ? `SSL certificate for ${displayName} has EXPIRED (${expiryDate})`
          : `SSL certificate for ${displayName} expires in ${result.daysRemaining} day${result.daysRemaining === 1 ? "" : "s"} (${expiryDate})`;

        await sendNotifications({
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          status: "ssl_expiring",
          message,
          timestamp: now.toISOString(),
        });

        await writeDebugLog(
          "ssl_expiring",
          monitor.name,
          null,
          message
        );

        alerted++;
      }
    }
  }

  return NextResponse.json({
    checked,
    alerted,
    total: httpsMonitors.length,
  });
}
