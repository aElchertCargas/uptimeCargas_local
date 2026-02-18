import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const channel = await prisma.notificationChannel.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.config !== undefined && { config: body.config }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
    },
  });

  return NextResponse.json(channel);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.notificationChannel.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
