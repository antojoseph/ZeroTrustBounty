import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { DEFAULT_DUMMY_PAYOUT_AMOUNT } from "@/lib/payments";
import { prisma } from "@/lib/prisma";

function parsePositiveAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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
  const body = (await request.json().catch(() => null)) as
    | {
        amount?: number | string;
      }
    | null;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      payment: true,
      program: {
        include: {
          company: true,
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const isCompanyOwner = report.program.company.userId === session.userId;
  if (!isCompanyOwner && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (report.payment?.status === "paid") {
    return NextResponse.json(
      {
        error: "Report already paid",
        details: "This report already has a paid bounty attached to it.",
      },
      { status: 400 }
    );
  }

  const requestedAmount = parsePositiveAmount(body?.amount);
  const payoutAmount =
    requestedAmount ??
    parsePositiveAmount(report.bountyAmount) ??
    DEFAULT_DUMMY_PAYOUT_AMOUNT;

  const existingPendingAmount =
    report.payment && report.payment.status !== "paid"
      ? report.payment.amount
      : 0;
  const fundsDelta = payoutAmount - existingPendingAmount;

  if (fundsDelta > report.program.company.availableFunds) {
    return NextResponse.json(
      {
        error: "Insufficient company funds",
        details:
          "This organization does not have enough dummy funds remaining to pay that bounty.",
      },
      { status: 400 }
    );
  }

  const reputationGain = Math.floor(payoutAmount / 100);

  const updatedReport = await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: report.program.company.id },
      data: {
        availableFunds: {
          decrement: fundsDelta,
        },
      },
    });

    await tx.payment.upsert({
      where: { reportId: id },
      create: {
        reportId: id,
        userId: report.reporterId,
        amount: payoutAmount,
        status: "paid",
        paidAt: new Date(),
      },
      update: {
        amount: payoutAmount,
        status: "paid",
        paidAt: new Date(),
      },
    });

    await tx.program.update({
      where: { id: report.programId },
      data: {
        totalPaid: {
          increment: payoutAmount,
        },
      },
    });

    await tx.user.update({
      where: { id: report.reporterId },
      data: {
        reputation: {
          increment: reputationGain,
        },
      },
    });

    return tx.report.update({
      where: { id },
      data: {
        bountyAmount: payoutAmount,
      },
      include: {
        payment: true,
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
      },
    });
  });

  return NextResponse.json({
    message: "Dummy bounty payment recorded.",
    report: {
      bountyAmount: updatedReport.bountyAmount,
      payment: updatedReport.payment
        ? {
            amount: updatedReport.payment.amount,
            status: updatedReport.payment.status,
            paidAt: updatedReport.payment.paidAt?.toISOString() ?? null,
          }
        : null,
      program: updatedReport.program,
    },
    paymentAmount: payoutAmount,
  });
}
