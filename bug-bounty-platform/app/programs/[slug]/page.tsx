import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function getProgram(slug: string) {
  return prisma.program.findUnique({
    where: { slug },
    include: {
      company: {
        select: {
          name: true,
          logoUrl: true,
          verified: true,
          website: true,
          description: true,
        },
      },
      _count: { select: { reports: true } },
    },
  });
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [program, session] = await Promise.all([getProgram(slug), getSession()]);

  if (!program) notFound();

  let scopeItems: string[] = [];
  let outOfScopeItems: string[] = [];

  try {
    scopeItems = JSON.parse(program.scope);
  } catch {
    scopeItems = program.scope.split("\n").filter(Boolean);
  }
  try {
    outOfScopeItems = JSON.parse(program.outOfScope);
  } catch {
    outOfScopeItems = program.outOfScope.split("\n").filter(Boolean);
  }

  const bountyRanges = [
    { severity: "Critical", min: Math.round(program.maxBounty * 0.7), max: program.maxBounty, color: "text-red-400" },
    { severity: "High", min: Math.round(program.maxBounty * 0.3), max: Math.round(program.maxBounty * 0.7), color: "text-orange-400" },
    { severity: "Medium", min: Math.round(program.minBounty * 2), max: Math.round(program.maxBounty * 0.3), color: "text-yellow-400" },
    { severity: "Low", min: program.minBounty, max: Math.round(program.minBounty * 2), color: "text-blue-400" },
    { severity: "Informational", min: 0, max: 0, color: "text-gray-400" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/programs" className="hover:text-green-400">Programs</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-300">{program.name}</span>
      </nav>

      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-gray-800 rounded-xl flex items-center justify-center text-2xl font-bold text-green-400 border border-gray-700 shrink-0">
              {program.company.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white">{program.name}</h1>
                {program.company.verified && (
                  <span className="flex items-center gap-1 text-xs bg-green-900/30 text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-sm">{program.company.name}</p>
              {program.company.website && (
                <a
                  href={program.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 text-xs hover:underline"
                >
                  {program.company.website}
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              program.status === "active"
                ? "bg-green-900/30 text-green-400 border border-green-700/50"
                : "bg-gray-800 text-gray-400"
            }`}>
              {program.status.charAt(0).toUpperCase() + program.status.slice(1)}
            </span>
            {session?.role === "researcher" && program.status === "active" && (
              <Link
                href={`/programs/${program.slug}/submit`}
                className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                Submit Report
              </Link>
            )}
            {!session && (
              <Link
                href="/login"
                className="bg-green-500 hover:bg-green-400 text-black font-bold px-6 py-2 rounded-lg text-sm transition-colors"
              >
                Sign In to Report
              </Link>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
          {[
            { label: "Min Bounty", value: `$${program.minBounty.toLocaleString()}` },
            { label: "Max Bounty", value: `$${program.maxBounty.toLocaleString()}` },
            { label: "Total Paid", value: `$${program.totalPaid.toLocaleString()}` },
            { label: "Reports", value: program._count.reports.toString() },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-xl font-bold text-green-400">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-3">Program Overview</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{program.description}</p>
          </div>

          {/* Scope */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">Scope</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  In Scope
                </h3>
                {scopeItems.length > 0 ? (
                  <ul className="space-y-1">
                    {scopeItems.map((item, i) => (
                      <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 text-sm">No scope defined yet.</p>
                )}
              </div>

              {outOfScopeItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Out of Scope
                  </h3>
                  <ul className="space-y-1">
                    {outOfScopeItems.map((item, i) => (
                      <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                        <span className="text-red-500 mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Bounty Table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">Bounty Ranges</h2>
            <div className="space-y-2">
              {bountyRanges.map((range) => (
                <div key={range.severity} className="flex items-center justify-between text-sm py-2 border-b border-gray-800 last:border-0">
                  <span className={`font-medium ${range.color}`}>{range.severity}</span>
                  <span className="text-gray-400">
                    {range.max === 0
                      ? "N/A"
                      : range.min === range.max
                      ? `$${range.max.toLocaleString()}`
                      : `$${range.min.toLocaleString()} – $${range.max.toLocaleString()}`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Program info */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="font-bold text-white mb-4">Program Info</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Response Time</span>
                <span className="text-gray-300">~{program.responseTime} days</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Reports</span>
                <span className="text-gray-300">{program._count.reports}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Status</span>
                <span className={program.status === "active" ? "text-green-400" : "text-gray-400"}>
                  {program.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
