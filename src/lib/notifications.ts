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
    default:
      return false;
  }
}
