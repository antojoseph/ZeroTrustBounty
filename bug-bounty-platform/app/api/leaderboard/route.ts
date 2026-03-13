import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const researchers = await prisma.user.findMany({
    where: { role: "researcher" },
    orderBy: { reputation: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      displayName: true,
      reputation: true,
      avatar: true,
      createdAt: true,
      _count: { select: { reports: true } },
      payments: { select: { amount: true, status: true } },
    },
  });

  const leaderboard = researchers.map((r) => ({
    ...r,
    totalEarned: r.payments
      .filter((p) => p.status === "paid")
      .reduce((sum, p) => sum + p.amount, 0),
    reportCount: r._count.reports,
  }));

  return NextResponse.json({ leaderboard });
}
