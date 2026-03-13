"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewProgramPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    scope: "",
    outOfScope: "",
    minBounty: "",
    maxBounty: "",
    responseTime: "7",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const scopeItems = form.scope
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const outOfScopeItems = form.outOfScope
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scope: JSON.stringify(scopeItems),
          outOfScope: JSON.stringify(outOfScopeItems),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create program");
        return;
      }

      router.push(`/programs/${data.program.slug}`);
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/dashboard" className="hover:text-green-400">
          Dashboard
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">New Program</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Create Bug Bounty Program</h1>
        <p className="text-gray-400 text-sm mt-1">
          Set up your program to receive vulnerability reports from researchers.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-white border-b border-gray-800 pb-3">
            Basic Information
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Program Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={update("name")}
              required
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
              placeholder="e.g., Acme Corp Bug Bounty"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={update("description")}
              required
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y"
              placeholder="Describe your program, what you're looking for, and any special instructions..."
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-white border-b border-gray-800 pb-3">
            Scope
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              In Scope <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              List one target per line (domains, subdomains, APIs, etc.)
            </p>
            <textarea
              value={form.scope}
              onChange={update("scope")}
              required
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y font-mono"
              placeholder={`*.example.com\napi.example.com\nhttps://app.example.com`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Out of Scope
            </label>
            <textarea
              value={form.outOfScope}
              onChange={update("outOfScope")}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors resize-y font-mono"
              placeholder={`blog.example.com\nstatus.example.com\nThird-party integrations`}
            />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-white border-b border-gray-800 pb-3">
            Bounty & Response
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Min Bounty (USD)
              </label>
              <input
                type="number"
                min="0"
                value={form.minBounty}
                onChange={update("minBounty")}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
                placeholder="50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Bounty (USD)
              </label>
              <input
                type="number"
                min="0"
                value={form.maxBounty}
                onChange={update("maxBounty")}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
                placeholder="10000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Expected Response Time (days)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={form.responseTime}
              onChange={update("responseTime")}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            {loading ? "Creating..." : "Create Program"}
          </button>
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
