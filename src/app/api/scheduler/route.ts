import { NextResponse } from "next/server";
import { startScheduler, isSchedulerRunning } from "@/lib/scheduler";

export async function GET() {
  if (!isSchedulerRunning()) {
    startScheduler();
  }
  return NextResponse.json({ running: isSchedulerRunning() });
}

export async function POST() {
  startScheduler();
  return NextResponse.json({ running: true });
}
