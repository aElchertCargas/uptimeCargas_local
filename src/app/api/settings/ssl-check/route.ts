import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { runSslCheckCycle } from "@/lib/run-ssl-check";

export const maxDuration = 120;

export async function POST() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSslCheckCycle({ force: true });

  return NextResponse.json(result);
}
