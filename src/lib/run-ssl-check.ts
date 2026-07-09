import { prisma } from "@/lib/prisma";
import {
  createZendeskSslTicket,
  getZendeskSettings,
} from "@/lib/alerting";
import {
  checkSslCertificate,
  isSslCheckExcludedHost,
  parseSslTarget,
} from "@/lib/ssl-checker";
import {
  dispatchNotification,
  writeDebugLog,
  type NotificationPayload,
} from "@/lib/notifications";

interface RunSslCheckOptions {
  force?: boolean;
}

interface RunSslCheckResult {
  checked: number;
  alerted: number;
  total: number;
}

const ONE_DAY_MS = 86_400_000;

async function getSslAlertDays(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "sslAlertDays" },
  });
  return row ? parseInt(row.value, 10) || 1 : 1;
}

function getDaysRemainingAt(expiresAt: Date, checkedAt: Date): number {
  return Math.floor((expiresAt.getTime() - checkedAt.getTime()) / ONE_DAY_MS);
}

export function shouldSendSslAlert({
  alertDays,
  currentDaysRemaining,
  currentExpiresAt,
  previousExpiresAt,
  previousCheckedAt,
}: {
  alertDays: number;
  currentDaysRemaining: number;
  currentExpiresAt: Date;
  previousExpiresAt: Date | null | undefined;
  previousCheckedAt: Date | null | undefined;
}): boolean {
  if (currentDaysRemaining > alertDays) {
    return false;
  }

  if (!previousExpiresAt || !previousCheckedAt) {
    return true;
  }

  if (previousExpiresAt.toISOString() !== currentExpiresAt.toISOString()) {
    return true;
  }

  return getDaysRemainingAt(previousExpiresAt, previousCheckedAt) > alertDays;
}

async function sendNotifications(payload: NotificationPayload) {
  const channels = await prisma.notificationChannel.findMany({
    where: { enabled: true },
  });
  await Promise.allSettled(
    channels.map((ch) =>
      dispatchNotification(
        ch.type,
        ch.name,
        ch.config as Record<string, unknown>,
        payload
      )
    )
  );
}

export async function runSslCheckCycle(
  options: RunSslCheckOptions = {}
): Promise<RunSslCheckResult> {
  const monitors = await prisma.monitor.findMany({
    where: { active: true },
  });

  const httpsMonitors = monitors.flatMap((monitor) => {
    const target = parseSslTarget(monitor.url);
    if (!target || isSslCheckExcludedHost(target.host)) {
      return [];
    }

    return [{ monitor, target }];
  });
  const alertDays = await getSslAlertDays();
  const zendeskSettings = await getZendeskSettings();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);

  let checked = 0;
  let alerted = 0;

  for (const { monitor, target } of httpsMonitors) {
    const displayName = target.displayName;

    if (
      !options.force &&
      monitor.sslLastCheckedAt &&
      monitor.sslLastCheckedAt > oneDayAgo
    ) {
      continue;
    }

    const result = await checkSslCertificate(target);

    if (!result) {
      continue;
    }

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

    if (
      shouldSendSslAlert({
        alertDays,
        currentDaysRemaining: result.daysRemaining,
        currentExpiresAt: result.expiresAt,
        previousExpiresAt: monitor.sslExpiresAt,
        previousCheckedAt: monitor.sslLastCheckedAt,
      })
    ) {
      const expiryDate = result.expiresAt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const message =
        result.daysRemaining <= 0
          ? `SSL certificate for ${displayName} has EXPIRED (${expiryDate})`
          : `SSL certificate for ${displayName} expires in ${result.daysRemaining} day${result.daysRemaining === 1 ? "" : "s"} (${expiryDate})`;
      const timestamp = now.toISOString();

      const zendesk = await createZendeskSslTicket(zendeskSettings, {
        monitorName: monitor.name,
        monitorUrl: monitor.url,
        message,
        timestamp,
        daysRemaining: result.daysRemaining,
        expiresAt: result.expiresAt,
        issuer: result.issuer,
      });

      await sendNotifications({
        monitorName: monitor.name,
        monitorUrl: monitor.url,
        status: "ssl_expiring",
        message,
        timestamp,
        ...(zendesk ? { zendesk } : {}),
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

  return {
    checked,
    alerted,
    total: httpsMonitors.length,
  };
}
