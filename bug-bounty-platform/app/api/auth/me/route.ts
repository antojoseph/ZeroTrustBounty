import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      reputation: true,
      bio: true,
      avatar: true,
      createdAt: true,
      company: { select: { id: true, name: true, verified: true } },
    },
  });

  return NextResponse.json({ user });
}
