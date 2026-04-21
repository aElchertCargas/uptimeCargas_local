import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { runSslCheckCycle } from "@/lib/run-ssl-check";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedCronRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSslCheckCycle();

  return NextResponse.json(result);
}
