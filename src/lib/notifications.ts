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
  status: "down" | "up";
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
        event: payload.status === "down" ? "monitor.down" : "monitor.up",
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
  const icon = payload.status === "down" ? "🔴" : "🟢";
  const title = `${icon} ${payload.monitorName} is ${payload.status.toUpperCase()}`;

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

function interpolateTemplate(template: string, payload: NotificationPayload): string {
  return template
    .replace(/\{\{monitorName\}\}/g, payload.monitorName)
    .replace(/\{\{monitorUrl\}\}/g, payload.monitorUrl)
    .replace(/\{\{status\}\}/g, payload.status)
    .replace(/\{\{message\}\}/g, payload.message)
    .replace(/\{\{timestamp\}\}/g, payload.timestamp);
}

function buildAdaptiveCard(payload: NotificationPayload) {
  const color = payload.status === "down" ? "attention" : "good";
  const icon = payload.status === "down" ? "🔴" : "🟢";

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
              text: `${icon} ${payload.monitorName} is ${payload.status.toUpperCase()}`,
              style: color === "attention" ? "default" : "default",
              color,
            },
            {
              type: "FactSet",
              facts: [
                { title: "Monitor", value: payload.monitorName },
                { title: "URL", value: payload.monitorUrl },
                { title: "Status", value: payload.status.toUpperCase() },
                { title: "Time", value: payload.timestamp },
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
  config: Record<string, unknown>,
  payload: NotificationPayload
): Promise<boolean> {
  switch (channelType) {
    case "webhook":
      return sendWebhook(config as unknown as WebhookConfig, payload);
    case "pushover":
      return sendPushover(config as unknown as PushoverConfig, payload);
    case "teams":
      return sendTeams(config as unknown as TeamsConfig, payload);
    default:
      return false;
  }
}
