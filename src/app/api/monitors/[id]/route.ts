import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const monitor = await prisma.monitor.findUnique({
    where: { id },
    include: {
      checks: {
        orderBy: { checkedAt: "desc" },
        take: 50,
      },
      incidents: {
        orderBy: { startedAt: "desc" },
        take: 20,
      },
    },
  });

  if (!monitor) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  return NextResponse.json(monitor);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  let expectedStatus: number[] | undefined;
  if (body.expectedStatus !== undefined) {
    expectedStatus = Array.isArray(body.expectedStatus)
      ? body.expectedStatus
      : [body.expectedStatus];
  }

  const monitor = await prisma.monitor.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.method !== undefined && { method: body.method }),
      ...(body.interval !== undefined && { interval: body.interval }),
      ...(body.timeout !== undefined && { timeout: body.timeout }),
      ...(expectedStatus !== undefined && { expectedStatus }),
      ...(body.maxRetries !== undefined && { maxRetries: body.maxRetries }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });

  return NextResponse.json(monitor);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.monitor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
