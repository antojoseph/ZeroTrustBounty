"use client";

import { useEffect, useRef, useState } from "react";

import {
  fileFromClipboardData,
  isEditableElement,
  MAX_PROOF_SIZE_BYTES,
} from "@/lib/tlsProofClipboard";

interface RevealedProofReportData {
  bountyAmount: number | null;
  tlsProofHasHiddenComponents: boolean;
  tlsProofRevealState: string | null;
  tlsProofRevealUnlockedAt: string | null;
  tlsProofFull: string | null;
  tlsProofFullFileName: string | null;
  tlsProofFullSentData: string | null;
  tlsProofFullRevealedAt: string | null;
}

interface TlsProofRevealUploaderProps {
  reportId: string;
  onProofRevealed: (reportData: RevealedProofReportData) => void;
}

export default function TlsProofRevealUploader({
  reportId,
  onProofRevealed,
}: TlsProofRevealUploaderProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">(
    "idle"
  );
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<HTMLDivElement>(null);

  const handleFile = (file: File) => {
    setError("");

    if (!file.name.endsWith(".tlsn")) {
      setSelectedFile(null);
      setStatus("error");
      setError("Upload the companion full .presentation.tlsn file generated alongside the redacted proof.");
      return;
    }

    if (file.size === 0) {
      setSelectedFile(null);
      setStatus("error");
      setError("The selected proof file is empty.");
      return;
    }

    if (file.size > MAX_PROOF_SIZE_BYTES) {
      setSelectedFile(null);
      setStatus("error");
      setError("Proof files larger than 1 MB are not supported.");
      return;
    }

    setSelectedFile(file);
    setStatus("idle");
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handlePaste = (clipboardData: DataTransfer | null) => {
    const file = fileFromClipboardData(clipboardData);
    if (!file) {
      return false;
    }

    handleFile(file);
    return true;
  };

  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      const activeElement = document.activeElement;
      if (
        isEditableElement(activeElement) &&
        !uploaderRef.current?.contains(activeElement)
      ) {
        return;
      }

      if (handlePaste(event.clipboardData)) {
        event.preventDefault();
      }
    };

    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  });

  const handleUpload = async () => {
    if (!selectedFile) {
      return;
    }

    setStatus("uploading");
    setError("");

    try {
      const formData = new FormData();
      formData.append("proof", selectedFile);

      const response = await fetch(`/api/reports/${reportId}/proof-reveal`, {
        method: "PUT",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.details || data.error || "Upload failed");
        setStatus("error");
        return;
      }

      setStatus("success");
      onProofRevealed(data.report);
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div ref={uploaderRef} className="space-y-4">
      {status !== "success" && (
        <div
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onPaste={(event) => {
            if (handlePaste(event.clipboardData)) {
              event.preventDefault();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          tabIndex={0}
          className="border-2 border-dashed border-amber-700/50 hover:border-amber-500 rounded-xl p-6 text-center cursor-pointer transition-colors group"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".tlsn,application/octet-stream"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleFile(file);
              }
            }}
          />

          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 bg-amber-950/30 rounded-xl flex items-center justify-center group-hover:bg-amber-900/40 transition-colors">
              <svg
                className="w-6 h-6 text-amber-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-100">
                Drop, choose, or paste the matching{" "}
                <span className="font-mono text-amber-300">full .presentation.tlsn</span>{" "}
                proof here
              </p>
              <p className="text-xs text-amber-200/70 mt-1">
                Use the companion full presentation generated from the same TLSNotary session as the redacted proof.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedFile && status !== "success" && (
        <div className="bg-amber-950/20 border border-amber-700/40 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-amber-100 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-amber-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Full Presentation Ready
            </h4>
            <button
              onClick={() => {
                setSelectedFile(null);
                setStatus("idle");
                setError("");
              }}
              className="text-xs text-amber-200/70 hover:text-red-300"
            >
              Remove
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-amber-200/60 mb-0.5">Filename</p>
              <p className="text-white font-mono break-all">{selectedFile.name}</p>
            </div>
            <div>
              <p className="text-amber-200/60 mb-0.5">Size</p>
              <p className="text-white">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-amber-700/30 bg-amber-950/20 p-3 text-xs text-amber-200/80">
            The app will verify that this full presentation comes from the same notarized TLS
            session as the redacted proof and reveals the same request with the hidden bytes filled in.
          </div>

          <button
            onClick={handleUpload}
            disabled={status === "uploading"}
            className="mt-4 w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-bold py-2.5 rounded-lg text-sm transition-colors"
          >
            {status === "uploading"
              ? "Verifying Reveal..."
              : "Reveal Full Request with Matching Proof"}
          </button>
        </div>
      )}

      {status === "success" && (
        <div className="bg-green-950/30 border border-green-700/50 rounded-xl p-5 text-center">
          <div className="text-green-400 text-2xl mb-2">✓</div>
          <p className="text-green-400 font-semibold text-sm">
            Full Presentation Matched
          </p>
          <p className="text-gray-400 text-xs mt-1">
            The uploaded full presentation matches the original redacted proof and has been attached to the report.
          </p>
        </div>
      )}

      {status === "error" && error && (
        <div className="bg-red-950/30 border border-red-700/50 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
