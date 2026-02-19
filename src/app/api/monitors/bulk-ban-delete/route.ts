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

  const monitors = await prisma.monitor.findMany({
    where: { id: { in: monitorIds } },
    select: { id: true, url: true },
  });

  const hostnames = new Set<string>();
  for (const m of monitors) {
    try {
      hostnames.add(new URL(m.url).hostname);
    } catch {
      // skip invalid URLs
    }
  }

  const existing = await prisma.excludedPattern.findMany({
    where: { pattern: { in: [...hostnames] } },
    select: { pattern: true },
  });
  const existingSet = new Set(existing.map((e) => e.pattern));
  const newPatterns = [...hostnames].filter((h) => !existingSet.has(h));

  if (newPatterns.length > 0) {
    await prisma.excludedPattern.createMany({
      data: newPatterns.map((pattern) => ({ pattern })),
    });
  }

  const result = await prisma.monitor.deleteMany({
    where: { id: { in: monitorIds } },
  });

  return NextResponse.json({
    deleted: result.count,
    banned: newPatterns.length,
  });
}
