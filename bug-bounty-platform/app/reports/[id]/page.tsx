"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SeverityBadge from "@/components/SeverityBadge";
import StatusBadge from "@/components/StatusBadge";
import TlsProofBadge from "@/components/TlsProofBadge";
import TlsProofViewer from "@/components/TlsProofViewer";
import TlsProofUploader from "@/components/TlsProofUploader";

interface Report {
  id: string;
  reporterId: string;
  title: string;
  description: string;
  impact: string;
  stepsToReproduce: string;
  severity: string;
  status: string;
  cvssScore: number | null;
  cveId: string | null;
  bountyAmount: number | null;
  tlsProof: string | null;
  tlsProofFormat: string | null;
  tlsProofFileName: string | null;
  tlsProofStatus: string | null;
  tlsProofServerName: string | null;
  tlsProofTime: string | null;
  tlsProofSentData: string | null;
  tlsProofRecvData: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: { username: string; displayName: string; reputation: number; avatar: string | null };
  triager: { username: string; displayName: string } | null;
  program: {
    id: string;
    name: string;
    slug: string;
    company: { name: string; userId: string };
  };
  comments: Comment[];
  payment: { amount: number; status: string; paidAt: string | null } | null;
}

interface Comment {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  user: { username: string; displayName: string; role: string; avatar: string | null };
}

interface CurrentUser {
  id: string;
  role: string;
  username: string;
}

const STATUS_OPTIONS = ["new", "triaged", "accepted", "resolved", "rejected", "duplicate", "informative"];

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [report, setReport] = useState<Report | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [bountyInput, setBountyInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showProofUploader, setShowProofUploader] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/reports/${id}`).then((r) => r.json()),
      fetch("/api/auth/me").then((r) => r.json()),
    ]).then(([reportData, userData]) => {
      if (reportData.error) {
        router.push("/dashboard");
        return;
      }
      setReport(reportData.report);
      setCurrentUser(userData.user);
      if (reportData.report?.bountyAmount) {
        setBountyInput(String(reportData.report.bountyAmount));
      }
      setLoading(false);
    });
  }, [id, router]);

  const isCompany = currentUser?.role === "company";
  const isOwner = report?.program.company.userId === currentUser?.id;
  const isReporter = report?.reporterId === currentUser?.id;

  const submitComment = async () => {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    const res = await fetch(`/api/reports/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: comment, isInternal }),
    });
    const data = await res.json();
    if (res.ok) {
      setReport((r) => r ? { ...r, comments: [...r.comments, data.comment] } : r);
      setComment("");
    }
    setSubmittingComment(false);
  };

  const updateStatus = async (status: string) => {
    if (!isOwner) return;
    setUpdatingStatus(true);
    setError("");
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, bountyAmount: bountyInput || undefined }),
    });
    const data = await res.json();
    if (res.ok) {
      setReport((r) => r ? { ...r, ...data.report } : r);
    } else {
      setError(data.error);
    }
    setUpdatingStatus(false);
  };

  const handleProofAttached = (proofUpdate: {
    tlsProof: string | null;
    tlsProofFormat: string | null;
    tlsProofFileName: string | null;
    tlsProofStatus: string | null;
    tlsProofServerName: string | null;
    tlsProofTime: string | null;
    tlsProofSentData: string | null;
    tlsProofRecvData: string | null;
  }) => {
    setReport((r) =>
      r
        ? {
            ...r,
            ...proofUpdate,
          }
        : r
    );
    setShowProofUploader(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-3/4"></div>
          <div className="h-4 bg-gray-800 rounded w-1/2"></div>
          <div className="h-48 bg-gray-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/dashboard" className="hover:text-green-400">Dashboard</Link>
        <span className="mx-2">/</span>
        <Link href={`/programs/${report.program.slug}`} className="hover:text-green-400">
          {report.program.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">Report #{report.id.slice(-8)}</span>
      </nav>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Report */}
        <div className="md:col-span-2 space-y-6">
          {/* Header */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex flex-wrap items-start gap-2 mb-4">
              <SeverityBadge severity={report.severity} />
              <StatusBadge status={report.status} />
              {report.tlsProofStatus && (
                <TlsProofBadge
                  status={report.tlsProofStatus}
                  serverName={report.tlsProofServerName}
                />
              )}
              {report.payment?.status === "paid" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  💰 ${report.payment.amount.toLocaleString()} Paid
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white mb-2">{report.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>
                Reported by{" "}
                <span className="text-gray-300">@{report.reporter.username}</span>
              </span>
              <span>{new Date(report.createdAt).toLocaleDateString()}</span>
              {report.reporter.reputation > 0 && (
                <span className="flex items-center gap-1 text-yellow-600">
                  ⭐ {report.reporter.reputation.toLocaleString()} rep
                </span>
              )}
            </div>
          </div>

          {/* TLSNotary Proof Section */}
          {report.tlsProofStatus === "verified" ? (
            <TlsProofViewer
              serverName={report.tlsProofServerName}
              sessionTime={report.tlsProofTime}
              sentData={report.tlsProofSentData}
              recvData={report.tlsProofRecvData}
              proofData={report.tlsProof}
              proofFormat={report.tlsProofFormat}
              proofFileName={report.tlsProofFileName}
              hasSignature={report.tlsProofFormat === "presentation_tlsn" ? true : undefined}
            />
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="w-5 h-5 bg-gray-700 rounded text-center text-xs leading-5">🔐</span>
                  TLSNotary PoC Verification
                </h2>
                {isReporter && !report.tlsProofStatus && (
                  <button
                    onClick={() => setShowProofUploader(!showProofUploader)}
                    className="text-xs bg-green-900/30 border border-green-700/50 text-green-400 hover:bg-green-900/50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {showProofUploader ? "Cancel" : "+ Attach Proof"}
                  </button>
                )}
              </div>
              {showProofUploader && isReporter ? (
                <TlsProofUploader
                  reportId={report.id}
                  onProofAttached={handleProofAttached}
                />
              ) : (
                <p className="text-sm text-gray-500">
                  No TLSNotary proof attached.{" "}
                  {isReporter ? (
                    <span>
                      Attach a{" "}
                      <span className="font-mono text-green-400">
                        .presentation.tlsn
                      </span>{" "}
                      generated by the dockerized TLSNotary API/prover flow to
                      cryptographically verify your PoC.
                    </span>
                  ) : (
                    "Researchers can attach TLSNotary proofs to cryptographically verify their PoC."
                  )}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-3">Description</h2>
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {report.description}
            </div>
          </div>

          {/* Steps */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-3">Steps to Reproduce</h2>
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-mono bg-gray-800/50 p-4 rounded-lg">
              {report.stepsToReproduce}
            </div>
          </div>

          {/* Impact */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-3">Impact</h2>
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {report.impact}
            </div>
          </div>

          {/* Comments */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">
              Activity ({report.comments.length})
            </h2>
            <div className="space-y-4 mb-6">
              {report.comments.length === 0 && (
                <p className="text-gray-500 text-sm">No comments yet.</p>
              )}
              {report.comments.map((c) => (
                <div
                  key={c.id}
                  className={`flex gap-3 ${c.isInternal ? "opacity-75" : ""}`}
                >
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                    {c.user.displayName[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        {c.user.displayName}
                      </span>
                      <span className="text-xs text-gray-600">@{c.user.username}</span>
                      {c.isInternal && (
                        <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                          internal
                        </span>
                      )}
                      <span className="text-xs text-gray-600 ml-auto">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800 rounded-lg p-3">
                      {c.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add comment */}
            {currentUser && (
              <div className="border-t border-gray-800 pt-4">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Add a comment..."
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-none mb-3"
                />
                <div className="flex items-center justify-between">
                  {isCompany && isOwner && (
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                        className="rounded"
                      />
                      Internal note (not visible to reporter)
                    </label>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={submitComment}
                      disabled={submittingComment || !comment.trim()}
                      className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                    >
                      {submittingComment ? "Posting..." : "Post Comment"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Program info */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="font-bold text-white mb-3 text-sm">Program</h3>
            <Link
              href={`/programs/${report.program.slug}`}
              className="text-green-400 hover:underline text-sm"
            >
              {report.program.name}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">{report.program.company.name}</p>
          </div>

          {/* TLSNotary proof status summary */}
          {report.tlsProofStatus === "verified" && (
            <div className="bg-green-950/20 border border-green-700/40 rounded-xl p-5">
              <h3 className="font-bold text-green-400 mb-3 text-sm flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                TLSNotary Verified PoC
              </h3>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-gray-500">Server</span>
                  <p className="text-green-300 font-mono mt-0.5">
                    {report.tlsProofServerName}
                  </p>
                </div>
                {report.tlsProofTime && (
                  <div>
                    <span className="text-gray-500">Session Time</span>
                    <p className="text-gray-300 mt-0.5">
                      {new Date(report.tlsProofTime).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Triage Controls (Company Only) */}
          {isOwner && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="font-bold text-white mb-4 text-sm">Triage Controls</h3>
              {error && (
                <div className="text-red-400 text-xs mb-3 bg-red-900/20 border border-red-700 rounded p-2">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Update Status</label>
                  <select
                    value={report.status}
                    onChange={(e) => updateStatus(e.target.value)}
                    disabled={updatingStatus}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Bounty Amount (USD)</label>
                  <input
                    type="number"
                    min="0"
                    value={bountyInput}
                    onChange={(e) => setBountyInput(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                    placeholder="0"
                  />
                </div>
                {report.tlsProofStatus === "verified" && (
                  <div className="text-xs bg-green-900/20 border border-green-700/40 rounded-lg p-2 text-green-400">
                    ✓ TLSNotary proof present — PoC is cryptographically verified
                  </div>
                )}
                <button
                  onClick={() => updateStatus(report.status)}
                  disabled={updatingStatus}
                  className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold py-2 rounded-lg text-sm transition-colors"
                >
                  {updatingStatus ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* Report metadata */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="font-bold text-white mb-3 text-sm">Details</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Report ID</span>
                <span className="text-gray-400 font-mono">#{report.id.slice(-8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Submitted</span>
                <span className="text-gray-400">{new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Updated</span>
                <span className="text-gray-400">{new Date(report.updatedAt).toLocaleDateString()}</span>
              </div>
              {report.cvssScore && (
                <div className="flex justify-between">
                  <span className="text-gray-500">CVSS Score</span>
                  <span className="text-orange-400">{report.cvssScore}</span>
                </div>
              )}
              {report.cveId && (
                <div className="flex justify-between">
                  <span className="text-gray-500">CVE ID</span>
                  <span className="text-blue-400">{report.cveId}</span>
                </div>
              )}
              {report.bountyAmount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Bounty</span>
                  <span className="text-green-400 font-semibold">${report.bountyAmount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-500">TLSNotary Proof</span>
                <TlsProofBadge status={report.tlsProofStatus} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
