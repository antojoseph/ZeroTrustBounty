import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  TlsProofVerificationError,
  type VerifiedTlsPresentation,
  verifyTlsPresentationWithApi,
} from "@/lib/tlsProofApi";
import {
  hasHiddenComponents,
  validateFullPresentationReveal,
} from "@/lib/tlsProofRedaction";

export const runtime = "nodejs";

function serializeRevealFields(report: {
  bountyAmount: number | null;
  tlsProofHasHiddenComponents: boolean;
  tlsProofRevealState: string | null;
  tlsProofRevealUnlockedAt: Date | null;
  tlsProofFull: string | null;
  tlsProofFullFileName: string | null;
  tlsProofFullSentData: string | null;
  tlsProofFullRevealedAt: Date | null;
}) {
  return {
    bountyAmount: report.bountyAmount,
    tlsProofHasHiddenComponents: report.tlsProofHasHiddenComponents,
    tlsProofRevealState: report.tlsProofRevealState,
    tlsProofRevealUnlockedAt:
      report.tlsProofRevealUnlockedAt?.toISOString() ?? null,
    tlsProofFull: report.tlsProofFull,
    tlsProofFullFileName: report.tlsProofFullFileName,
    tlsProofFullSentData: report.tlsProofFullSentData,
    tlsProofFullRevealedAt:
      report.tlsProofFullRevealedAt?.toISOString() ?? null,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    bountyAmount?: number | string;
  } | null;

  const report = await prisma.report.findUnique({
    where: { id },
    include: { program: { include: { company: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const isCompanyOwner = report.program.company.userId === session.userId;
  if (!isCompanyOwner && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (report.tlsProofStatus !== "verified") {
    return NextResponse.json(
      {
        error: "No verified TLSNotary proof",
        details:
          "Attach and verify a TLSNotary proof before unlocking the full-request reveal flow.",
      },
      { status: 400 }
    );
  }

  if (!report.tlsProofHasHiddenComponents) {
    return NextResponse.json(
      {
        error: "Reveal not required",
        details:
          "This TLSNotary proof already exposes the full request, so no gated reveal is needed.",
      },
      { status: 400 }
    );
  }

  const bountyAmount = Number(body?.bountyAmount);
  if (!Number.isFinite(bountyAmount) || bountyAmount <= 0) {
    return NextResponse.json(
      {
        error: "Invalid bounty amount",
        details:
          "Confirm a positive bounty amount before asking the reporter to reveal the full request.",
      },
      { status: 400 }
    );
  }

  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      bountyAmount,
      tlsProofRevealState: "ready_for_reporter_reveal",
      tlsProofRevealUnlockedAt: new Date(),
    },
    select: {
      bountyAmount: true,
      tlsProofHasHiddenComponents: true,
      tlsProofRevealState: true,
      tlsProofRevealUnlockedAt: true,
      tlsProofFull: true,
      tlsProofFullFileName: true,
      tlsProofFullSentData: true,
      tlsProofFullRevealedAt: true,
    },
  });

  return NextResponse.json({
    message:
      "The reporter can now reveal the full request. The company should continue validating the bug using the TLSNotary-verified response until that reveal is submitted.",
    report: serializeRevealFields(updatedReport),
  });
}

export async function PUT(
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

  const isReporter = report.reporterId === session.userId;
  if (!isReporter && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (report.tlsProofStatus !== "verified" || !report.tlsProofHasHiddenComponents) {
    return NextResponse.json(
      {
        error: "Reveal not available",
        details:
          "This report does not have a redacted TLSNotary proof that can be completed with a full request reveal.",
      },
      { status: 400 }
    );
  }

  if (report.tlsProofRevealState !== "ready_for_reporter_reveal") {
    return NextResponse.json(
      {
        error: "Reveal is still locked",
        details:
          "The company must first confirm the bug using the verified TLSNotary response and confirm a bounty amount before the full request can be revealed.",
      },
      { status: 400 }
    );
  }

  let redactedAttestationFingerprint = report.tlsProofFingerprint;
  if (
    !redactedAttestationFingerprint &&
    report.tlsProof &&
    report.tlsProofFormat === "presentation_tlsn"
  ) {
    try {
      const storedProof = Buffer.from(report.tlsProof, "base64");
      const parsedStoredProof = await verifyTlsPresentationWithApi(
        storedProof,
        report.tlsProofFileName || "attached.presentation.tlsn"
      );
      redactedAttestationFingerprint = parsedStoredProof.attestationFingerprint;

      await prisma.report.update({
        where: { id },
        data: { tlsProofFingerprint: redactedAttestationFingerprint },
      });
    } catch (error) {
      const details =
        error instanceof Error
          ? error.message
          : "Unable to derive a fingerprint for the original TLSNotary proof.";

      return NextResponse.json(
        {
          error: "Original TLSNotary proof could not be revalidated",
          details,
        },
        { status: 500 }
      );
    }
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error: "Invalid reveal upload",
        details:
          "Upload the matching full TLSNotary .presentation.tlsn file as multipart/form-data.",
      },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const proofPart = formData.get("proof");

  if (!(proofPart instanceof File)) {
    return NextResponse.json(
      {
        error: "Missing full presentation",
        details:
          "Attach the matching full TLSNotary .presentation.tlsn file in the 'proof' field.",
      },
      { status: 400 }
    );
  }

  if (!proofPart.name.endsWith(".tlsn")) {
    return NextResponse.json(
      {
        error: "Invalid full presentation",
        details: "Only TLSNotary .tlsn presentation files are supported for reveal.",
      },
      { status: 400 }
    );
  }

  const proofBuffer = Buffer.from(await proofPart.arrayBuffer());
  if (proofBuffer.length === 0) {
    return NextResponse.json(
      {
        error: "Invalid full presentation",
        details: "The uploaded TLSNotary presentation file was empty.",
      },
      { status: 400 }
    );
  }

  let parsedFullPresentation: VerifiedTlsPresentation;
  try {
    parsedFullPresentation = await verifyTlsPresentationWithApi(
      proofBuffer,
      proofPart.name
    );
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unknown TLSNotary verification error";
    const statusCode =
      error instanceof TlsProofVerificationError ? error.statusCode : 500;

    return NextResponse.json(
      {
        error:
          statusCode === 400
            ? "Invalid full TLSNotary presentation"
            : "TLSNotary verification API unavailable",
        details,
      },
      { status: statusCode }
    );
  }

  if (hasHiddenComponents(parsedFullPresentation.sentData)) {
    return NextResponse.json(
      {
        error: "Full presentation still redacted",
        details:
          "Upload the companion full presentation generated from the same TLSNotary session, not another redacted proof.",
      },
      { status: 400 }
    );
  }

  const validation = validateFullPresentationReveal({
    redactedRequest: report.tlsProofSentData,
    fullRequest: parsedFullPresentation.sentData,
    redactedResponse: report.tlsProofRecvData,
    fullResponse: parsedFullPresentation.recvData,
    redactedServerName: report.tlsProofServerName,
    fullServerName: parsedFullPresentation.serverName,
    redactedSessionTime: report.tlsProofTime,
    fullSessionTime: parsedFullPresentation.sessionTime,
    redactedAttestationFingerprint,
    fullAttestationFingerprint: parsedFullPresentation.attestationFingerprint,
  });

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Invalid full request reveal",
        details: validation.error,
      },
      { status: 400 }
    );
  }

  const updatedReport = await prisma.report.update({
    where: { id },
    data: {
      tlsProofFull: proofBuffer.toString("base64"),
      tlsProofFullFileName: proofPart.name,
      tlsProofFullFingerprint: parsedFullPresentation.attestationFingerprint,
      tlsProofFullSentData: validation.normalizedFullRequest,
      tlsProofFullRevealedAt: new Date(),
      tlsProofRevealState: "revealed",
    },
    select: {
      bountyAmount: true,
      tlsProofHasHiddenComponents: true,
      tlsProofRevealState: true,
      tlsProofRevealUnlockedAt: true,
      tlsProofFull: true,
      tlsProofFullFileName: true,
      tlsProofFullSentData: true,
      tlsProofFullRevealedAt: true,
    },
  });

  return NextResponse.json({
    message:
      "The full request has been revealed by uploading a matching full TLSNotary presentation from the same notarized session.",
    report: serializeRevealFields(updatedReport),
  });
}
