import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isSchedulerRunning, startScheduler } from "@/lib/scheduler";

export async function GET() {
  return NextResponse.json({
    running: isSchedulerRunning(),
    mode: "internal-all-jobs",
    message:
      "The in-process scheduler owns /api/cron/check, /api/cron/ssl-check, and /api/cron/cleanup inside the always-on web instance.",
  });
}

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  startScheduler();

  return NextResponse.json({
    running: true,
    mode: "internal-all-jobs",
    message:
      "The in-process scheduler owns /api/cron/check, /api/cron/ssl-check, and /api/cron/cleanup inside the always-on web instance.",
  });
}
