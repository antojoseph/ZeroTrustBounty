import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const program = await prisma.program.findUnique({
    where: { slug },
    include: {
      company: {
        select: { name: true, logoUrl: true, verified: true, website: true },
      },
      _count: { select: { reports: true } },
    },
  });

  if (!program) {
    return NextResponse.json({ error: "Program not found" }, { status: 404 });
  }

  return NextResponse.json({ program });
}
