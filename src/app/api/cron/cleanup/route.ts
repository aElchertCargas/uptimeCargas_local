import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runCleanupCycle } from "@/lib/run-cleanup";

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedCronRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCleanupCycle();

  return NextResponse.json(result);
}
