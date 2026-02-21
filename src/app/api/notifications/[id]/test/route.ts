import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const channel = await prisma.notificationChannel.findUnique({
    where: { id },
  });

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const success = await dispatchNotification(
    channel.type,
    channel.name,
    channel.config as Record<string, unknown>,
    {
      monitorName: "Test Monitor",
      monitorUrl: "https://example.com",
      status: "down",
      message: "This is a test notification from Uptime Cargas",
      timestamp: new Date().toISOString(),
    }
  );

  return NextResponse.json({ success });
}
