import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const monitorIds: string[] = body.monitorIds;

  if (!Array.isArray(monitorIds) || monitorIds.length === 0) {
    return NextResponse.json(
      { error: "monitorIds must be a non-empty array" },
      { status: 400 }
    );
  }

  const result = await prisma.monitor.deleteMany({
    where: { id: { in: monitorIds } },
  });

  return NextResponse.json({ deleted: result.count });
}
