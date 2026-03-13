import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "active";
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "12");
  const skip = (page - 1) * limit;

  const where = {
    status,
    ...(search && {
      OR: [
        { name: { contains: search } },
        { description: { contains: search } },
      ],
    }),
  };

  const [programs, total] = await Promise.all([
    prisma.program.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        company: { select: { name: true, logoUrl: true, verified: true } },
        _count: { select: { reports: true } },
      },
    }),
    prisma.program.count({ where }),
  ]);

  return NextResponse.json({ programs, total, page, limit });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "company") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, description, scope, outOfScope, minBounty, maxBounty, responseTime } =
    await request.json();

  if (!name || !description || !scope) {
    return NextResponse.json(
      { error: "Name, description, and scope are required" },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { userId: session.userId },
  });

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const existing = await prisma.program.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const program = await prisma.program.create({
    data: {
      companyId: company.id,
      name,
      slug: finalSlug,
      description,
      scope: typeof scope === "string" ? scope : JSON.stringify(scope),
      outOfScope: outOfScope
        ? typeof outOfScope === "string"
          ? outOfScope
          : JSON.stringify(outOfScope)
        : "[]",
      minBounty: parseFloat(minBounty) || 0,
      maxBounty: parseFloat(maxBounty) || 0,
      responseTime: parseInt(responseTime) || 7,
    },
  });

  return NextResponse.json({ program }, { status: 201 });
}
