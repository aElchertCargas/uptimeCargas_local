import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, email, password } = body;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (email && email.trim().toLowerCase() !== existing.email) {
    const duplicate = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
  }

  const data: Record<string, string> = {};
  if (name?.trim()) data.name = name.trim();
  if (email?.trim()) data.email = email.trim().toLowerCase();
  if (password) {
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }
    data.passwordHash = await hash(password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const userCount = await prisma.user.count();
  if (userCount <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the last user" },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
