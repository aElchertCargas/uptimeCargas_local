import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { validateMonitorInput } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

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
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json();
  const existing = await prisma.monitor.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  let input;
  try {
    input = validateMonitorInput({
      ...existing,
      ...body,
      expectedStatus: body.expectedStatus ?? existing.expectedStatus,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid monitor" },
      { status: 400 }
    );
  }

  const monitor = await prisma.monitor.update({
    where: { id },
    data: {
      ...input,
    },
  });

  return NextResponse.json(monitor);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  await prisma.monitor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
