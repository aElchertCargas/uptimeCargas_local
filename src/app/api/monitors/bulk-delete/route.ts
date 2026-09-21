import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

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
