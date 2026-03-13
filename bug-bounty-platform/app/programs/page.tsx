"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Program {
  id: string;
  name: string;
  slug: string;
  description: string;
  minBounty: number;
  maxBounty: number;
  totalPaid: number;
  status: string;
  responseTime: number;
  company: { name: string; logoUrl: string | null; verified: boolean };
  _count: { reports: number };
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 12;

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      status: "active",
      page: String(page),
      limit: String(limit),
      ...(search && { search }),
    });
    const res = await fetch(`/api/programs?${params}`);
    const data = await res.json();
    setPrograms(data.programs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(fetchPrograms, 300);
    return () => clearTimeout(timer);
  }, [fetchPrograms]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Bug Bounty Programs</h1>
        <p className="text-gray-400">
          {total.toLocaleString()} active programs accepting vulnerability reports
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <div className="relative max-w-lg">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search programs..."
            className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl text-sm focus:outline-none focus:border-green-500 transition-colors"
          />
        </div>
      </div>

      {/* Programs Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse">
              <div className="w-12 h-12 bg-gray-800 rounded-lg mb-4"></div>
              <div className="h-5 bg-gray-800 rounded mb-2 w-3/4"></div>
              <div className="h-4 bg-gray-800 rounded mb-4 w-1/2"></div>
              <div className="h-3 bg-gray-800 rounded mb-1"></div>
              <div className="h-3 bg-gray-800 rounded w-4/5"></div>
            </div>
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-xl mb-2">No programs found</p>
          {search && <p className="text-sm">Try a different search term</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program) => (
            <Link
              key={program.id}
              href={`/programs/${program.slug}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-700 transition-all hover:-translate-y-0.5 group flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-xl font-bold text-green-400 border border-gray-700 shrink-0">
                  {program.company.name[0]}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {program.company.verified && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Verified
                    </span>
                  )}
                </div>
              </div>

              <h3 className="font-bold text-white text-lg mb-0.5 group-hover:text-green-400 transition-colors">
                {program.name}
              </h3>
              <p className="text-sm text-gray-500 mb-2">{program.company.name}</p>
              <p className="text-sm text-gray-400 line-clamp-2 mb-4 flex-1">
                {program.description}
              </p>

              <div className="border-t border-gray-800 pt-4 mt-auto">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-green-400 font-semibold">
                    ${program.minBounty.toLocaleString()} – ${program.maxBounty.toLocaleString()}
                  </span>
                  <span className="text-gray-500">{program._count.reports} reports</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>~{program.responseTime}d response</span>
                  <span>${program.totalPaid.toLocaleString()} paid</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-10">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
