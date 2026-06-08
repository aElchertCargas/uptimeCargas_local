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
  daysRemaining?: number;
  expiryDate?: string;
  issuer?: string;
}

export interface ZendeskRecoveryPayload {
  monitorName: string;
  monitorUrl: string;
  message: string;
  downTimestamp: string;
  recoveredTimestamp: string;
  downtimeMinutes: number;
  responseTimeMs: number;
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

const DEFAULT_SSL_EXPIRING_SUBJECT_TEMPLATE =
  "{{monitorName}} - SSL Certificate Expiring";

const DEFAULT_SSL_EXPIRED_SUBJECT_TEMPLATE =
  "{{monitorName}} - SSL Certificate EXPIRED";

const DEFAULT_SSL_BODY_TEMPLATE = `Monitor: {{monitorName}}
URL: {{monitorUrl}}
SSL status: {{message}}
Certificate expires: {{expiryDate}}
Days remaining: {{daysRemaining}}
Issuer: {{issuer}}

This ticket was automatically created by the uptime monitor.`;

export function getDefaultSubjectTemplate() {
  return DEFAULT_SUBJECT_TEMPLATE;
}

export function getDefaultBodyTemplate() {
  return DEFAULT_BODY_TEMPLATE;
}

export function getDefaultSslSubjectTemplate(daysRemaining: number) {
  return daysRemaining <= 0
    ? DEFAULT_SSL_EXPIRED_SUBJECT_TEMPLATE
    : DEFAULT_SSL_EXPIRING_SUBJECT_TEMPLATE;
}

export function getDefaultSslBodyTemplate() {
  return DEFAULT_SSL_BODY_TEMPLATE;
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
    .replace(/\{\{downtimeMinutes\}\}/g, String(payload.downtimeMinutes))
    .replace(/\{\{daysRemaining\}\}/g, String(payload.daysRemaining ?? ""))
    .replace(/\{\{expiryDate\}\}/g, payload.expiryDate ?? "")
    .replace(/\{\{issuer\}\}/g, payload.issuer ?? "");
}

function getZendeskHeaders(config: ZendeskConfig) {
  const credentials = Buffer.from(
    `${config.email}/token:${config.apiToken}`
  ).toString("base64");

  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${credentials}`,
  };
}

function buildZendeskRecoveryComment(payload: ZendeskRecoveryPayload): string {
  return `Recovery update from uptime monitor:

Monitor: ${payload.monitorName}
URL: ${payload.monitorUrl}
Down since: ${toEST(payload.downTimestamp)}
Recovered at: ${toEST(payload.recoveredTimestamp)}
Duration: ${payload.downtimeMinutes} minutes
Response time: ${payload.responseTimeMs} ms

Original error: ${payload.message}

The monitor is back up.`;
}

export async function createZendeskTicket(
  config: ZendeskConfig,
  subjectTemplate: string,
  bodyTemplate: string,
  payload: ZendeskTicketPayload,
  tags = ["uptime-monitor", "site-down"]
): Promise<string | null> {
  try {
    const subject = interpolateZendeskTemplate(subjectTemplate, payload);
    const body = interpolateZendeskTemplate(bodyTemplate, payload);

    const response = await fetch(
      `https://${config.subdomain}.zendesk.com/api/v2/tickets.json`,
      {
        method: "POST",
        headers: getZendeskHeaders(config),
        body: JSON.stringify({
          ticket: {
            subject,
            comment: { body },
            group_id: parseInt(config.groupId, 10),
            priority: "high",
            tags,
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

export async function updateZendeskTicket(
  config: ZendeskConfig,
  ticketId: string,
  payload: ZendeskRecoveryPayload
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${config.subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`,
      {
        method: "PUT",
        headers: getZendeskHeaders(config),
        body: JSON.stringify({
          ticket: {
            comment: {
              body: buildZendeskRecoveryComment(payload),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      console.error(`Zendesk API error ${response.status}: ${error}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to update Zendesk ticket:", err);
    return false;
  }
}
