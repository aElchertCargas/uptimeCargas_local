import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
  retentionDays: "90",
  defaultInterval: "120",
};

export async function GET() {
  const rows = await prisma.appSetting.findMany();
  const settings: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const updates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" || typeof value === "number") {
      updates.push({ key, value: String(value) });
    }
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
    settings[row.key] = row.value;
  }
  return NextResponse.json(settings);
}
