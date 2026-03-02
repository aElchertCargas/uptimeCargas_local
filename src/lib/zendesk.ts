export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  groupId: string;
}

export interface ZendeskTicketPayload {
  monitorName: string;
  monitorUrl: string;
  message: string;
  timestamp: string;
  downtimeMinutes: number;
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

const DEFAULT_SUBJECT_TEMPLATE =
  "{{monitorName}} is DOWN ({{downtimeMinutes}} min)";

const DEFAULT_BODY_TEMPLATE = `Monitor: {{monitorName}}
URL: {{monitorUrl}}
Down since: {{timestamp}}
Duration: {{downtimeMinutes}} minutes

Error: {{message}}

This ticket was automatically created by the uptime monitor.`;

export function getDefaultSubjectTemplate() {
  return DEFAULT_SUBJECT_TEMPLATE;
}

export function getDefaultBodyTemplate() {
  return DEFAULT_BODY_TEMPLATE;
}

export function interpolateZendeskTemplate(
  template: string,
  payload: ZendeskTicketPayload
): string {
  return template
    .replace(/\{\{monitorName\}\}/g, payload.monitorName)
    .replace(/\{\{monitorUrl\}\}/g, payload.monitorUrl)
    .replace(/\{\{message\}\}/g, payload.message ?? "")
    .replace(/\{\{timestamp\}\}/g, toEST(payload.timestamp))
    .replace(/\{\{downtimeMinutes\}\}/g, String(payload.downtimeMinutes));
}

export async function createZendeskTicket(
  config: ZendeskConfig,
  subjectTemplate: string,
  bodyTemplate: string,
  payload: ZendeskTicketPayload
): Promise<string | null> {
  try {
    const subject = interpolateZendeskTemplate(subjectTemplate, payload);
    const body = interpolateZendeskTemplate(bodyTemplate, payload);

    const credentials = Buffer.from(
      `${config.email}/token:${config.apiToken}`
    ).toString("base64");

    const response = await fetch(
      `https://${config.subdomain}.zendesk.com/api/v2/tickets.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          ticket: {
            subject,
            comment: { body },
            group_id: parseInt(config.groupId, 10),
            priority: "high",
            tags: ["uptime-monitor", "site-down"],
            custom_fields: [
              {
                id: 38842256723213,
                value: "irl_4",
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      console.error(`Zendesk API error ${response.status}: ${error}`);
      return null;
    }

    const data = await response.json();
    return String(data.ticket?.id ?? null);
  } catch (err) {
    console.error("Failed to create Zendesk ticket:", err);
    return null;
  }
}
