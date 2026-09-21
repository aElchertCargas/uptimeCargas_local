import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10) || 100,
    500
  );

  const [logs, setting] = await Promise.all([
    prisma.debugLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.appSetting.findUnique({ where: { key: "debugLogEnabled" } }),
  ]);

  return NextResponse.json({
    enabled: setting?.value !== "false",
    logs,
  });
}

export async function DELETE() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  await prisma.debugLog.deleteMany();
  return NextResponse.json({ cleared: true });
}
