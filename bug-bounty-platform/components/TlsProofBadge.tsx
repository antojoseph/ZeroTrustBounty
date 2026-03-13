"use client";

interface TlsProofBadgeProps {
  status: string | null;
  serverName?: string | null;
  sessionTime?: string | null;
}

export default function TlsProofBadge({
  status,
  serverName,
  sessionTime,
}: TlsProofBadgeProps) {
  if (!status) return null;

  if (status === "verified") {
    return (
      <div className="inline-flex items-center gap-1.5 bg-green-950/50 border border-green-700/60 text-green-400 text-xs px-3 py-1.5 rounded-full font-medium">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        TLSNotary Verified
        {serverName && (
          <span className="text-green-600 font-normal">— {serverName}</span>
        )}
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="inline-flex items-center gap-1.5 bg-red-950/50 border border-red-700/60 text-red-400 text-xs px-3 py-1.5 rounded-full font-medium">
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        Invalid Proof
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 bg-yellow-950/50 border border-yellow-700/60 text-yellow-400 text-xs px-3 py-1.5 rounded-full font-medium">
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Proof Pending
    </div>
  );
}
