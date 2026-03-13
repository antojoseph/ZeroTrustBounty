import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SeverityBadge from "@/components/SeverityBadge";
import StatusBadge from "@/components/StatusBadge";

export default async function ResearcherDashboard() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.role !== "researcher") redirect("/dashboard/company");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      displayName: true,
      username: true,
      reputation: true,
      createdAt: true,
      _count: { select: { reports: true } },
      payments: { where: { status: "paid" }, select: { amount: true } },
    },
  });

  if (!user) redirect("/login");

  const reports = await prisma.report.findMany({
    where: { reporterId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      program: {
        include: { company: { select: { name: true } } },
      },
    },
  });

  const totalEarned = user.payments.reduce((sum, p) => sum + p.amount, 0);
  const acceptedReports = reports.filter((r) =>
    ["accepted", "resolved"].includes(r.status)
  ).length;
  const openReports = reports.filter((r) =>
    ["new", "triaged"].includes(r.status)
  ).length;

  const statsByStatus = reports.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Welcome back, {user.displayName}
          </h1>
          <p className="text-gray-400 text-sm mt-1">@{user.username}</p>
        </div>
        <Link
          href="/programs"
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Find Programs
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Reputation", value: user.reputation.toLocaleString(), icon: "⭐" },
          { label: "Total Earned", value: `$${totalEarned.toLocaleString()}`, icon: "💰" },
          { label: "Accepted", value: acceptedReports, icon: "✅" },
          { label: "Open Reports", value: openReports, icon: "🔍" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5"
          >
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Status Breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4">Report Status Breakdown</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(statsByStatus).map(([status, count]) => (
            <div
              key={status}
              className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2"
            >
              <StatusBadge status={status} />
              <span className="text-white font-bold text-sm">{count}</span>
            </div>
          ))}
          {Object.keys(statsByStatus).length === 0 && (
            <p className="text-gray-500 text-sm">No reports yet. Start hacking!</p>
          )}
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-bold text-white">My Reports</h2>
          <span className="text-sm text-gray-500">{reports.length} total</span>
        </div>

        {reports.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-500 mb-3">You haven&apos;t submitted any reports yet.</p>
            <Link
              href="/programs"
              className="text-green-400 hover:underline text-sm"
            >
              Browse programs to get started →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-6 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Program</th>
                  <th className="text-left px-4 py-3 font-medium">Severity</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Bounty</th>
                  <th className="text-right px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/reports/${report.id}`}
                        className="text-white hover:text-green-400 text-sm font-medium transition-colors line-clamp-1"
                      >
                        {report.title}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      <Link
                        href={`/programs/${report.program.slug}`}
                        className="hover:text-green-400 transition-colors"
                      >
                        {report.program.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <SeverityBadge severity={report.severity} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {report.bountyAmount ? (
                        <span className="text-green-400 font-semibold text-sm">
                          ${report.bountyAmount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-gray-500">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
