import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const channels = await prisma.notificationChannel.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    channels.map((channel) => ({
      ...channel,
      config: redactChannelConfig(channel.config),
    }))
  );
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const body = await request.json();
  if (
    typeof body.name !== "string" ||
    !["webhook", "pushover", "teams"].includes(body.type) ||
    !body.config ||
    typeof body.config !== "object" ||
    Array.isArray(body.config)
  ) {
    return NextResponse.json({ error: "Invalid notification channel" }, { status: 400 });
  }

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

  return NextResponse.json(
    {
      ...channel,
      config: redactChannelConfig(channel.config),
    },
    { status: 201 }
  );
}

function redactChannelConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      /url|token|key|secret|header/i.test(key) ? "********" : value,
    ])
  );
}
