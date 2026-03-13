"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Program {
  id: string;
  name: string;
  slug: string;
  company: { name: string };
}

const SEVERITIES = [
  { value: "critical", label: "Critical", desc: "Authentication bypass, RCE, SQLi affecting sensitive data", color: "text-red-400 border-red-700" },
  { value: "high", label: "High", desc: "Significant impact like SSRF, XXE, privilege escalation", color: "text-orange-400 border-orange-700" },
  { value: "medium", label: "Medium", desc: "XSS, IDOR, CSRF with moderate impact", color: "text-yellow-400 border-yellow-700" },
  { value: "low", label: "Low", desc: "Information disclosure, minor logic flaws", color: "text-blue-400 border-blue-700" },
  { value: "informational", label: "Informational", desc: "Best practice issues, minor findings", color: "text-gray-400 border-gray-600" },
];

export default function SubmitReportPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [program, setProgram] = useState<Program | null>(null);
  const [form, setForm] = useState({
    title: "",
    severity: "medium",
    description: "",
    impact: "",
    stepsToReproduce: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/programs/${slug}`)
      .then((r) => r.json())
      .then((data) => setProgram(data.program));
  }, [slug]);

  const update = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, programId: program.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        setError(data.error || "Submission failed");
        return;
      }

      router.push(`/reports/${data.report.id}`);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!program) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <div className="animate-pulse text-gray-500">Loading program...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/programs" className="hover:text-green-400">Programs</Link>
        <span className="mx-2">/</span>
        <Link href={`/programs/${slug}`} className="hover:text-green-400">{program.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">Submit Report</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Submit Vulnerability Report</h1>
        <p className="text-gray-400 text-sm">
          Reporting to <span className="text-white">{program.name}</span> by {program.company.name}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Title */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Vulnerability Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={update("title")}
            required
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
            placeholder="e.g., Stored XSS in user profile bio field"
          />
        </div>

        {/* Severity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Severity <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, severity: s.value }))}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  form.severity === s.value
                    ? `${s.color} bg-gray-800/50`
                    : "border-gray-700 text-gray-500 hover:border-gray-600"
                }`}
              >
                <div className={`text-xs font-bold mb-1 ${form.severity === s.value ? s.color.split(" ")[0] : ""}`}>
                  {s.label}
                </div>
                <div className="text-xs text-gray-500 leading-tight hidden sm:block">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Describe the vulnerability in detail. What is it? Where is it? What caused it?
          </p>
          <textarea
            value={form.description}
            onChange={update("description")}
            required
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y"
            placeholder="Detailed description of the vulnerability..."
          />
        </div>

        {/* Steps to Reproduce */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Steps to Reproduce <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Provide clear, numbered steps so the team can reproduce the issue.
          </p>
          <textarea
            value={form.stepsToReproduce}
            onChange={update("stepsToReproduce")}
            required
            rows={8}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y font-mono"
            placeholder={`1. Go to https://example.com/profile
2. Click on 'Edit Bio'
3. Enter the following payload: <script>alert(1)</script>
4. Save and reload the page
5. Observe the JavaScript execution`}
          />
        </div>

        {/* Impact */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Impact <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-3">
            What is the impact of this vulnerability? Who is affected and how?
          </p>
          <textarea
            value={form.impact}
            onChange={update("impact")}
            required
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y"
            placeholder="An attacker could steal session cookies from any user who views the affected profile..."
          />
        </div>

        {/* Guidelines notice */}
        <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 text-sm text-blue-400">
          <p className="font-medium mb-1">Responsible Disclosure Reminder</p>
          <p className="text-blue-500 text-xs">
            By submitting this report, you confirm that you have not accessed any data beyond what was
            necessary to demonstrate the vulnerability, and that you will not disclose this vulnerability
            publicly until it has been resolved.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            {loading ? "Submitting..." : "Submit Report"}
          </button>
          <Link
            href={`/programs/${slug}`}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
