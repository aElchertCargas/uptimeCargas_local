import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, parseInt(sp.get("limit") ?? "50")), 500);
  const status = sp.get("status"); // "up" | "down" | null (all)
  const from = sp.get("from");     // ISO date string
  const to = sp.get("to");         // ISO date string
  const hours = sp.get("hours");   // legacy: hours lookback

  const where: Prisma.CheckWhereInput = { monitorId: id };

  if (from || to) {
    where.checkedAt = {};
    if (from) where.checkedAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.checkedAt.lte = toDate;
    }
  } else if (hours) {
    where.checkedAt = { gte: new Date(Date.now() - parseInt(hours) * 3600_000) };
  }

  if (status === "up") where.isUp = true;
  else if (status === "down") where.isUp = false;

  const [checks, total] = await Promise.all([
    prisma.check.findMany({
      where,
      orderBy: { checkedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.check.count({ where }),
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
