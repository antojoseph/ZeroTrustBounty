import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseTlsProof, validateTlsProofStructure } from "@/lib/tlsProof";

/**
 * POST /api/reports/[id]/verify-proof
 *
 * Accepts a TLSNotary proof JSON, parses it, and stores the
 * extracted metadata alongside the report. The proof proves that
 * the whitehat actually observed the vulnerability in a real TLS session.
 *
 * Full cryptographic verification (notary signature + merkle proofs)
 * requires the Rust verifier — here we do structural validation and
 * extract readable metadata.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: { program: { include: { company: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // Only the reporter or company owner can attach a proof
  const isReporter = report.reporterId === session.userId;
  const isCompanyOwner = report.program.company.userId === session.userId;

  if (!isReporter && !isCompanyOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let proofJson: string;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    proofJson = typeof body.proof === "string" ? body.proof : JSON.stringify(body.proof);
  } else {
    proofJson = await request.text();
  }

  // Validate proof structure
  const validationError = validateTlsProofStructure(proofJson);
  if (validationError) {
    return NextResponse.json(
      {
        error: "Invalid TLSNotary proof",
        details: validationError,
        status: "invalid",
      },
      { status: 400 }
    );
  }

  // Parse proof and extract metadata
  const parsed = parseTlsProof(proofJson);

  // Store proof and extracted metadata
  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      tlsProof: proofJson,
      tlsProofStatus: "verified",
      tlsProofServerName: parsed.serverName,
      tlsProofTime: parsed.sessionTime,
      tlsProofSentData: parsed.sentDataPreview || null,
      tlsProofRecvData: parsed.recvDataPreview || null,
    },
    select: {
      id: true,
      tlsProofStatus: true,
      tlsProofServerName: true,
      tlsProofTime: true,
      tlsProofSentData: true,
    },
  });

  return NextResponse.json({
    message: "TLSNotary proof attached successfully",
    proofStatus: updatedReport.tlsProofStatus,
    serverName: updatedReport.tlsProofServerName,
    sessionTime: updatedReport.tlsProofTime,
    sentDataPreview: updatedReport.tlsProofSentData,
    summary: {
      serverName: parsed.serverName,
      sessionTime: parsed.sessionTime.toISOString(),
      sentLen: parsed.sentLen,
      recvLen: parsed.recvLen,
      hasSignature: parsed.hasSignature,
      merkleRoot: parsed.merkleRoot,
    },
  });
}

/**
 * DELETE /api/reports/[id]/verify-proof
 * Removes the attached TLSNotary proof from a report.
 */
export async function DELETE(
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
    select: { reporterId: true },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.reporterId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.report.update({
    where: { id },
    data: {
      tlsProof: null,
      tlsProofStatus: null,
      tlsProofServerName: null,
      tlsProofTime: null,
      tlsProofSentData: null,
      tlsProofRecvData: null,
    },
  });

  return NextResponse.json({ message: "Proof removed" });
}
