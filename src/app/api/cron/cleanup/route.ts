import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_RETENTION_DAYS = 90;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: "retentionDays" },
  });
  const retentionDays = setting ? parseInt(setting.value, 10) || DEFAULT_RETENTION_DAYS : DEFAULT_RETENTION_DAYS;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const deleted = await prisma.check.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });

  // Save last cleanup info for display in settings
  const now = new Date();
  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "lastCleanupAt" },
      create: { key: "lastCleanupAt", value: now.toISOString() },
      update: { value: now.toISOString() },
    }),
    prisma.appSetting.upsert({
      where: { key: "lastCleanupCount" },
      create: { key: "lastCleanupCount", value: String(deleted.count) },
      update: { value: String(deleted.count) },
    }),
  ]);

  return NextResponse.json({
    deleted: deleted.count,
    retentionDays,
    cutoffDate: cutoff.toISOString(),
  });
}
