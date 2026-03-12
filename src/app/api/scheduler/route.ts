import { NextResponse } from "next/server";
import { isSchedulerRunning, startScheduler } from "@/lib/scheduler";

export async function GET() {
  return NextResponse.json({
    running: isSchedulerRunning(),
    mode: "internal-checks-only",
    message:
      "The in-process scheduler owns /api/cron/check. Railway should keep handling /api/cron/ssl-check and /api/cron/cleanup.",
  });
}

export async function POST() {
  startScheduler();

  return NextResponse.json({
    running: true,
    mode: "internal-checks-only",
    message:
      "The in-process scheduler owns /api/cron/check. Railway should keep handling /api/cron/ssl-check and /api/cron/cleanup.",
  });
}
