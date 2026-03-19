import { NextRequest, NextResponse } from "next/server";
import { runCleanupCycle } from "@/lib/run-cleanup";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCleanupCycle();

  return NextResponse.json(result);
}
