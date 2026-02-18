import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const monitors = await prisma.monitor.findMany({
    include: {
      checks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
      _count: {
        select: { checks: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(monitors);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const expectedStatus = Array.isArray(body.expectedStatus)
    ? body.expectedStatus
    : body.expectedStatus != null
      ? [body.expectedStatus]
      : [200, 401];

  const monitor = await prisma.monitor.create({
    data: {
      name: body.name,
      url: body.url,
      method: body.method ?? "GET",
      interval: body.interval ?? 120,
      timeout: body.timeout ?? 48,
      expectedStatus,
      maxRetries: body.maxRetries ?? 3,
      active: body.active ?? true,
      tags: body.tags ?? [],
    },
  });

  return NextResponse.json(monitor, { status: 201 });
}
