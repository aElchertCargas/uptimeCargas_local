import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const monitors: { name: string; url: string }[] = body.monitors;

  if (!Array.isArray(monitors) || monitors.length === 0) {
    return NextResponse.json({ error: "monitors array is required" }, { status: 400 });
  }

  const created = await prisma.monitor.createMany({
    data: monitors.map((m) => ({
      name: m.name,
      url: m.url,
      method: "GET",
      interval: 120,
      timeout: 48,
      expectedStatus: [200, 401],
      maxRetries: 3,
      active: true,
      tags: ["auto-sync"],
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({ created: created.count }, { status: 201 });
}
