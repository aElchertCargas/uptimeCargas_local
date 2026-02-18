import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;

  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const hours = parseInt(searchParams.get("hours") ?? "24");

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [checks, total] = await Promise.all([
    prisma.check.findMany({
      where: {
        monitorId: id,
        checkedAt: { gte: since },
      },
      orderBy: { checkedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.check.count({
      where: {
        monitorId: id,
        checkedAt: { gte: since },
      },
    }),
  ]);

  return NextResponse.json({
    checks,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
