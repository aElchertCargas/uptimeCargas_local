import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { ids, interval } = body;

  if (typeof interval !== "number" || interval < 1) {
    return NextResponse.json(
      { error: "interval must be a positive number" },
      { status: 400 }
    );
  }

  const where = ids === "all" || !ids
    ? {}
    : { id: { in: ids as string[] } };

  const result = await prisma.monitor.updateMany({
    where,
    data: { interval },
  });

  return NextResponse.json({ updated: result.count });
}
