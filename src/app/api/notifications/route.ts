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

  const channel = await prisma.notificationChannel.create({
    data: {
      name: body.name,
      type: body.type,
      config: body.config,
      enabled: body.enabled ?? true,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
