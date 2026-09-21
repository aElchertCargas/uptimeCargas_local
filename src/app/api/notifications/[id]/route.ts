import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await request.json();
  const existing = await prisma.notificationChannel.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  if (body.isDefault === true) {
    await prisma.notificationChannel.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const channel = await prisma.notificationChannel.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.config !== undefined && {
        config: mergeChannelConfig(existing.config, body.config),
      }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
    },
  });

  return NextResponse.json({
    ...channel,
    config: redactChannelConfig(channel.config),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  await prisma.notificationChannel.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

function mergeChannelConfig(existing: unknown, incoming: unknown) {
  const previous =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};
  const next =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? incoming
      : {};

  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => [
      key,
      value === "" || value === "********" ? (previous as Record<string, unknown>)[key] : value,
    ])
  );
}

function redactChannelConfig(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      /url|token|key|secret|header/i.test(key) ? "********" : value,
    ])
  );
}
