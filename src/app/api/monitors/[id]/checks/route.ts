import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(Math.max(1, parseInt(sp.get("limit") ?? "50")), 500);
  const status = sp.get("status");
  const from = sp.get("from");
  const to = sp.get("to");
  const hours = sp.get("hours");

  // Build date filter
  let checkedAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (from || to) {
    checkedAtFilter = {};
    if (from) checkedAtFilter.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      checkedAtFilter.lte = toDate;
    }
  } else if (hours) {
    checkedAtFilter = { gte: new Date(Date.now() - parseInt(hours) * 3600_000) };
  }

  const where = {
    monitorId: id,
    ...(checkedAtFilter && { checkedAt: checkedAtFilter }),
    ...(status === "up" && { isUp: true }),
    ...(status === "down" && { isUp: false }),
  };

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
