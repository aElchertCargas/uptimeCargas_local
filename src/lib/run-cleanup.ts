import { prisma } from "@/lib/prisma";
import { writeDebugLog } from "@/lib/notifications";

const DEFAULT_RETENTION_DAYS = 90;

export interface RunCleanupResult {
  deleted: number;
  retentionDays: number;
  cutoffDate: string;
}

async function getRetentionDays(): Promise<number> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "retentionDays" },
  });

  return setting
    ? Number.parseInt(setting.value, 10) || DEFAULT_RETENTION_DAYS
    : DEFAULT_RETENTION_DAYS;
}

export async function runCleanupCycle(): Promise<RunCleanupResult> {
  const retentionDays = await getRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await prisma.check.deleteMany({
    where: { checkedAt: { lt: cutoff } },
  });

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

  await writeDebugLog(
    "cleanup",
    "scheduler",
    null,
    `Deleted ${deleted.count} check(s) older than ${retentionDays} day(s)`
  );

  return {
    deleted: deleted.count,
    retentionDays,
    cutoffDate: cutoff.toISOString(),
  };
}
