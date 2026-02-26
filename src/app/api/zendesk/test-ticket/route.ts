import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createZendeskTicket } from "@/lib/zendesk";
import { writeDebugLog } from "@/lib/notifications";

const DEFAULT_SUBJECT = "{{monitorName}} is DOWN ({{downtimeMinutes}} min)";
const DEFAULT_BODY = `Monitor: {{monitorName}}
URL: {{monitorUrl}}
Down since: {{timestamp}}
Duration: {{downtimeMinutes}} minutes

Error: {{message}}

This ticket was automatically created by the uptime monitor.`;

export async function POST() {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "zendeskEnabled",
          "zendeskSubdomain",
          "zendeskEmail",
          "zendeskApiToken",
          "zendeskGroupId",
          "zendeskSubjectTemplate",
          "zendeskBodyTemplate",
        ],
      },
    },
  });
  const s = new Map(rows.map((r) => [r.key, r.value]));

  const subdomain = s.get("zendeskSubdomain") ?? "";
  const email = s.get("zendeskEmail") ?? "";
  const apiToken = s.get("zendeskApiToken") ?? "";
  const groupId = s.get("zendeskGroupId") ?? "";

  if (!subdomain || !email || !apiToken || !groupId) {
    return NextResponse.json(
      { error: "Zendesk credentials and group ID must be saved before testing" },
      { status: 400 }
    );
  }

  const payload = {
    monitorName: "Test Monitor",
    monitorUrl: "https://example.com",
    message: "This is a test ticket created from the uptime monitor settings.",
    timestamp: new Date().toISOString(),
    downtimeMinutes: 30,
  };

  const subjectTemplate = s.get("zendeskSubjectTemplate") ?? DEFAULT_SUBJECT;
  const bodyTemplate = s.get("zendeskBodyTemplate") ?? DEFAULT_BODY;

  const ticketId = await createZendeskTicket(
    { subdomain, email, apiToken, groupId },
    subjectTemplate,
    bodyTemplate,
    payload
  );

  if (!ticketId) {
    return NextResponse.json(
      { error: "Failed to create Zendesk ticket — check credentials and group ID" },
      { status: 502 }
    );
  }

  const ticketUrl = `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}`;

  await writeDebugLog(
    "zendesk_ticket",
    "Test Monitor",
    "zendesk",
    `Test Zendesk ticket #${ticketId} created — ${ticketUrl}`
  ).catch(() => {});

  return NextResponse.json({ ticketId, ticketUrl });
}
