import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
  retentionDays: "90",
  defaultInterval: "120",
  alertDelaySeconds: "300",
  falseDownProtectionEnabled: "true",
  falseDownProtectionMinAffectedMonitors: "8",
  falseDownProtectionMinAffectedRatio: "0.2",
  falseDownProtectionMinNetworkErrorRatio: "0.75",
  debugLogEnabled: "true",
  sslAlertDays: "1",
  zendeskEnabled: "false",
  zendeskSubdomain: "",
  zendeskEmail: "",
  zendeskApiToken: "",
  zendeskGroupId: "",
  zendeskTicketDelayMinutes: "30",
  zendeskSslAlertsEnabled: "false",
  zendeskSubjectTemplate: "{{monitorName}} is DOWN ({{downtimeMinutes}} min)",
  zendeskBodyTemplate: `Monitor: {{monitorName}}
URL: {{monitorUrl}}
Down since: {{timestamp}}
Duration: {{downtimeMinutes}} minutes

Error: {{message}}

This ticket was automatically created by the uptime monitor.`,
};

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const rows = await prisma.appSetting.findMany();
  const settings: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    settings[row.key] =
      row.key === "zendeskApiToken" ? (row.value ? "********" : "") : row.value;
  }
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const body = await request.json();

  const updates: { key: string; value: string }[] = [];
  
  // Check if Zendesk is being enabled (was false, now true)
  let zendeskBeingEnabled = false;
  if (body.zendeskEnabled === "true" || body.zendeskEnabled === true) {
    const currentSetting = await prisma.appSetting.findUnique({
      where: { key: "zendeskEnabled" },
    });
    const wasDisabled = !currentSetting || currentSetting.value !== "true";
    if (wasDisabled) {
      zendeskBeingEnabled = true;
    }
  }
  
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" || typeof value === "number") {
      if (key === "zendeskApiToken" && (value === "" || value === "********")) {
        continue;
      }
      updates.push({ key, value: String(value) });
    }
  }

  // If Zendesk is being enabled, save the current timestamp
  if (zendeskBeingEnabled) {
    updates.push({ 
      key: "zendeskEnabledAt", 
      value: new Date().toISOString() 
    });
  }

  await Promise.all(
    updates.map((u) =>
      prisma.appSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      })
    )
  );

  const rows = await prisma.appSetting.findMany();
  const settings: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key === "zendeskApiToken") {
      settings[row.key] = row.value ? "********" : "";
    } else {
      settings[row.key] = row.value;
    }
  }
  return NextResponse.json(settings);
}
