import { auth } from "@/auth";
import type { NextRequest } from "next/server";

export async function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const session = await auth();
  return Boolean(session?.user);
}
