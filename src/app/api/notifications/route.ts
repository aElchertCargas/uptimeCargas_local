import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const channels = await prisma.notificationChannel.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(channels);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.isDefault) {
    await prisma.notificationChannel.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  const channel = await prisma.notificationChannel.create({
    data: {
      name: body.name,
      type: body.type,
      config: body.config,
      enabled: body.enabled ?? true,
      isDefault: body.isDefault ?? false,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
