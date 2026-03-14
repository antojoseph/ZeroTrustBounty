"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DEFAULT_DUMMY_PAYOUT_AMOUNT } from "@/lib/payments";

interface PaidReportUpdate {
  bountyAmount: number | null;
  payment: {
    amount: number;
    status: string;
    paidAt: string | null;
  } | null;
  program: {
    id: string;
    name: string;
    slug: string;
    company: {
      name: string;
      userId: string;
      availableFunds: number;
    };
  };
}

interface PayReportButtonProps {
  reportId: string;
  amount?: number | null;
  paymentStatus?: string | null;
  compact?: boolean;
  onPaid?: (report: PaidReportUpdate) => void;
}

export default function PayReportButton({
  reportId,
  amount,
  paymentStatus,
  compact = false,
  onPaid,
}: PayReportButtonProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const effectiveAmount =
    amount && amount > 0 ? amount : DEFAULT_DUMMY_PAYOUT_AMOUNT;
  const alreadyPaid = paymentStatus === "paid";

  const handlePay = async () => {
    if (alreadyPaid) {
      return;
    }

    setSubmitting(true);
    setError("");

    const res = await fetch(`/api/reports/${reportId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: effectiveAmount }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.details || data.error || "Payment failed.");
      setSubmitting(false);
      return;
    }

    if (onPaid && data.report) {
      onPaid(data.report);
    } else {
      router.refresh();
    }

    setSubmitting(false);
  };

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <button
        onClick={handlePay}
        disabled={submitting || alreadyPaid}
        className={
          compact
            ? "rounded-lg border border-green-600/40 bg-green-900/20 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors hover:bg-green-900/35 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
            : "w-full rounded-lg bg-green-500 py-2 text-sm font-semibold text-black transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        }
      >
        {alreadyPaid
          ? `Already Paid $${effectiveAmount.toLocaleString()}`
          : submitting
            ? "Paying..."
            : `Pay Researcher $${effectiveAmount.toLocaleString()}`}
      </button>
      {error && (
        <p className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
