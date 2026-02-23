import { prisma } from "@/lib/prisma";

interface WebhookConfig {
  url: string;
}

interface PushoverConfig {
  userKey: string;
  appToken: string;
  priority?: number;
  sound?: string;
  device?: string;
}

interface TeamsConfig {
  url: string;
  bodyType: "adaptive-card" | "custom";
  customBody?: string;
  headers?: Record<string, string>;
}

export interface NotificationPayload {
  monitorName: string;
  monitorUrl: string;
  status: "down" | "up" | "ssl_expiring";
  message: string;
  timestamp: string;
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: payload.status === "ssl_expiring"
          ? "monitor.ssl_expiring"
          : payload.status === "down"
            ? "monitor.down"
            : "monitor.up",
        monitor: {
          name: payload.monitorName,
          url: payload.monitorUrl,
        },
        message: payload.message,
        timestamp: payload.timestamp,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendPushover(
  config: PushoverConfig,
  payload: NotificationPayload
): Promise<boolean> {
  const icon = payload.status === "down" ? "🔴" : payload.status === "ssl_expiring" ? "🟡" : "🟢";
  const title = payload.status === "ssl_expiring"
    ? `${icon} ${payload.monitorName} SSL Certificate Expiring`
    : `${icon} ${payload.monitorName} is ${payload.status.toUpperCase()}`;

  try {
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: config.appToken,
        user: config.userKey,
        title,
        message: payload.message,
        priority: config.priority ?? (payload.status === "down" ? 1 : 0),
        sound: config.sound ?? (payload.status === "down" ? "siren" : "pushover"),
        url: payload.monitorUrl,
        url_title: "View Monitor",
        ...(config.device && { device: config.device }),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function toEST(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

function interpolateTemplate(template: string, payload: NotificationPayload): string {
  return template
    .replace(/\{\{monitorName\}\}/g, payload.monitorName)
    .replace(/\{\{monitorUrl\}\}/g, payload.monitorUrl)
    .replace(/\{\{status\}\}/g, payload.status)
    .replace(/\{\{message\}\}/g, payload.message)
    .replace(/\{\{timestamp\}\}/g, toEST(payload.timestamp));
}

function buildAdaptiveCard(payload: NotificationPayload) {
  const color = payload.status === "down" ? "attention" : payload.status === "ssl_expiring" ? "warning" : "good";
  const icon = payload.status === "down" ? "🔴" : payload.status === "ssl_expiring" ? "🟡" : "🟢";
  const estTime = toEST(payload.timestamp);

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "medium",
              weight: "bolder",
              text: payload.status === "ssl_expiring"
                ? `${icon} ${payload.monitorName} SSL Certificate Expiring`
                : `${icon} ${payload.monitorName} is ${payload.status.toUpperCase()}`,
              color,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Monitor", value: payload.monitorName },
                { title: "URL", value: payload.monitorUrl },
                { title: "Status", value: payload.status.toUpperCase() },
                { title: "Time", value: estTime },
              ],
            },
            {
              type: "TextBlock",
              text: payload.message,
              wrap: true,
              spacing: "small",
            },
          ],
        },
      },
    ],
  };
}

export async function sendTeams(
  config: TeamsConfig,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };

    let body: string;
    if (config.bodyType === "custom" && config.customBody) {
      body = interpolateTemplate(config.customBody, payload);
    } else {
      body = JSON.stringify(buildAdaptiveCard(payload));
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function dispatchNotification(
  channelType: string,
  channelName: string,
  config: Record<string, unknown>,
  payload: NotificationPayload
): Promise<boolean> {
  let ok = false;
  switch (channelType) {
    case "webhook":
      ok = await sendWebhook(config as unknown as WebhookConfig, payload);
      break;
    case "pushover":
      ok = await sendPushover(config as unknown as PushoverConfig, payload);
      break;
    case "teams":
      ok = await sendTeams(config as unknown as TeamsConfig, payload);
      break;
  }

  await writeDebugLog(
    ok ? "webhook_sent" : "webhook_failed",
    payload.monitorName,
    channelName,
    ok
      ? `${channelType} notification sent (${payload.status})`
      : `${channelType} notification failed (${payload.status})`
  ).catch(() => {});

  return ok;
}

export async function writeDebugLog(
  type: string,
  monitor: string,
  channel: string | null,
  message: string
) {
  const enabled = await prisma.appSetting
    .findUnique({ where: { key: "debugLogEnabled" } })
    .then((r) => r?.value !== "false")
    .catch(() => true);
  if (!enabled) return;

  await prisma.debugLog.create({
    data: { type, monitor, channel, message },
  });
}
