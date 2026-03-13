import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("programId");
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (session.role === "researcher") {
    where.reporterId = session.userId;
  } else if (session.role === "company") {
    const company = await prisma.company.findUnique({
      where: { userId: session.userId },
      include: { programs: { select: { id: true } } },
    });
    if (company) {
      where.programId = { in: company.programs.map((p) => p.id) };
    }
  }

  if (programId) where.programId = programId;
  if (status) where.status = status;
  if (severity) where.severity = severity;

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { username: true, displayName: true, reputation: true } },
        program: { select: { name: true, slug: true, company: { select: { name: true } } } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return NextResponse.json({ reports, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "researcher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { programId, title, description, impact, stepsToReproduce, severity } =
    await request.json();

  if (!programId || !title || !description || !impact || !stepsToReproduce) {
    return NextResponse.json(
      { error: "All required fields must be provided" },
      { status: 400 }
    );
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || program.status !== "active") {
    return NextResponse.json(
      { error: "Program not found or not accepting reports" },
      { status: 404 }
    );
  }

  const report = await prisma.report.create({
    data: {
      programId,
      reporterId: session.userId,
      title,
      description,
      impact,
      stepsToReproduce,
      severity: severity || "medium",
    },
  });

  return NextResponse.json({ report }, { status: 201 });
}
