import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reporter: {
        select: { username: true, displayName: true, reputation: true, avatar: true },
      },
      triager: {
        select: { username: true, displayName: true },
      },
      program: {
        include: {
          company: { select: { name: true, userId: true, availableFunds: true } },
        },
      },
      comments: {
        include: {
          user: { select: { username: true, displayName: true, role: true, avatar: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      payment: true,
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Access control: researcher can see own reports, company can see their program reports
  const canAccess =
    session.role === "admin" ||
    report.reporterId === session.userId ||
    report.program.company.userId === session.userId;

  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ report });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const report = await prisma.report.findUnique({
    where: { id },
    include: { program: { include: { company: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const isCompanyOwner = report.program.company.userId === session.userId;
  const isReporter = report.reporterId === session.userId;

  if (!isCompanyOwner && !isReporter && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedFields: Record<string, unknown> = {};

  if (isCompanyOwner || session.role === "admin") {
    if (body.status) allowedFields.status = body.status;
    if (body.bountyAmount !== undefined) allowedFields.bountyAmount = parseFloat(body.bountyAmount);
    if (body.triagerId) allowedFields.triagerId = body.triagerId;
    if (body.cvssScore !== undefined) allowedFields.cvssScore = parseFloat(body.cvssScore);
    if (body.cveId) allowedFields.cveId = body.cveId;
  }

  const updatedReport = await prisma.report.update({
    where: { id },
    data: allowedFields,
    include: {
      reporter: {
        select: {
          username: true,
          displayName: true,
          reputation: true,
          avatar: true,
        },
      },
      program: {
        select: {
          id: true,
          name: true,
          slug: true,
          company: {
            select: {
              name: true,
              userId: true,
              availableFunds: true,
            },
          },
        },
      },
      payment: true,
    },
  });

  return NextResponse.json({ report: updatedReport });
}
