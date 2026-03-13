import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { content, isInternal } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }

  const report = await prisma.report.findUnique({
    where: { id },
    include: { program: { include: { company: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const isCompanyOwner = report.program.company.userId === session.userId;
  const isReporter = report.reporterId === session.userId;

  if (!isCompanyOwner && !isReporter) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const comment = await prisma.comment.create({
    data: {
      reportId: id,
      userId: session.userId,
      content: content.trim(),
      isInternal: isInternal && isCompanyOwner,
    },
    include: {
      user: { select: { username: true, displayName: true, role: true, avatar: true } },
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
