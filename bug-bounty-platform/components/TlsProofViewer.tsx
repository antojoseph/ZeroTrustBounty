"use client";

import { useState } from "react";

interface TlsProofViewerProps {
  serverName: string | null;
  sessionTime: string | null;
  sentData: string | null;
  proofJson?: string | null;
  hasSignature?: boolean;
}

export default function TlsProofViewer({
  serverName,
  sessionTime,
  sentData,
  proofJson,
  hasSignature,
}: TlsProofViewerProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="bg-green-950/20 border border-green-700/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-green-700/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-900/50 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-green-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-400">
              TLSNotary Proof Verified
            </h3>
            <p className="text-xs text-green-600">
              Cryptographically verifiable proof of concept
            </p>
          </div>
        </div>
        {hasSignature !== undefined && (
          <span
            className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
              hasSignature
                ? "bg-green-900/40 text-green-400 border border-green-700/50"
                : "bg-yellow-900/30 text-yellow-400 border border-yellow-700/50"
            }`}
          >
            {hasSignature ? "Notary Signed" : "Self-Attested"}
          </span>
        )}
      </div>

      {/* Proof details */}
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Verified Server</p>
            <p className="text-green-300 font-mono font-medium">
              {serverName || "—"}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-0.5">Session Time</p>
            <p className="text-gray-200 text-xs">
              {sessionTime
                ? new Date(sessionTime).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>

        {sentData && (
          <div>
            <p className="text-gray-500 text-xs mb-1.5">
              HTTP Request (from proof — redacted portions shown as X)
            </p>
            <pre className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 font-mono overflow-auto max-h-40 whitespace-pre-wrap border border-gray-800">
              {sentData.substring(0, 500)}
              {sentData.length > 500 ? "\n..." : ""}
            </pre>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <div className="flex items-center gap-1.5 text-xs text-green-500">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Server identity verified via TLS certificate chain
          </div>
          <div className="flex items-center gap-1.5 text-xs text-green-500">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Transcript integrity protected by Merkle proofs
          </div>
        </div>

        {proofJson && (
          <div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showRaw ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showRaw ? "Hide" : "Show"} raw proof JSON
            </button>
            {showRaw && (
              <pre className="mt-2 bg-gray-950 rounded-lg p-3 text-xs text-gray-400 font-mono overflow-auto max-h-48 whitespace-pre-wrap border border-gray-800">
                {proofJson.substring(0, 2000)}
                {proofJson.length > 2000 ? "\n... (truncated)" : ""}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-green-950/10 border-t border-green-700/20">
        <p className="text-xs text-green-700">
          This proof was generated using{" "}
          <a
            href="https://tlsnotary.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:text-green-400 underline"
          >
            TLSNotary
          </a>
          , an open protocol for verifiable TLS session attestation. The proof
          cryptographically demonstrates that the reported HTTP exchange occurred
          without requiring trust in the reporter.
        </p>
      </div>
    </div>
  );
}
