import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SeverityBadge from "@/components/SeverityBadge";
import StatusBadge from "@/components/StatusBadge";

export default async function CompanyDashboard() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.role !== "company") redirect("/dashboard/researcher");

  const company = await prisma.company.findUnique({
    where: { userId: session.userId },
    include: {
      programs: {
        include: {
          _count: { select: { reports: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!company) redirect("/login");

  const programIds = company.programs.map((p) => p.id);

  const [recentReports, stats] = await Promise.all([
    prisma.report.findMany({
      where: { programId: { in: programIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        reporter: { select: { username: true, displayName: true } },
        program: { select: { name: true, slug: true } },
      },
    }),
    prisma.report.groupBy({
      by: ["status"],
      where: { programId: { in: programIds } },
      _count: true,
    }),
  ]);

  const totalPaid = company.programs.reduce((s, p) => s + p.totalPaid, 0);
  const totalReports = company.programs.reduce((s, p) => s + p._count.reports, 0);
  const newReports = stats.find((s) => s.status === "new")?._count || 0;
  const resolvedReports = stats.find((s) => s.status === "resolved")?._count || 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">{company.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Company Dashboard</p>
        </div>
        <Link
          href="/dashboard/company/programs/new"
          className="bg-green-500 hover:bg-green-400 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          + New Program
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Programs", value: company.programs.filter((p) => p.status === "active").length, icon: "📋" },
          { label: "Total Reports", value: totalReports, icon: "🐛" },
          { label: "New Reports", value: newReports, icon: "🆕" },
          { label: "Total Paid Out", value: `$${totalPaid.toLocaleString()}`, icon: "💰" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-gray-500 text-xs mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Programs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Your Programs</h2>
          <Link href="/dashboard/company/programs/new" className="text-green-400 hover:text-green-300 text-sm">
            + Add Program
          </Link>
        </div>
        {company.programs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-3">No programs yet.</p>
            <Link href="/dashboard/company/programs/new" className="text-green-400 hover:underline text-sm">
              Create your first bug bounty program →
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {company.programs.map((program) => (
              <div
                key={program.id}
                className="border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <Link
                    href={`/programs/${program.slug}`}
                    className="font-semibold text-white hover:text-green-400 transition-colors"
                  >
                    {program.name}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    program.status === "active"
                      ? "bg-green-900/30 text-green-400"
                      : "bg-gray-800 text-gray-400"
                  }`}>
                    {program.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{program._count.reports} reports</span>
                  <span>${program.minBounty.toLocaleString()}–${program.maxBounty.toLocaleString()}</span>
                  <span>${program.totalPaid.toLocaleString()} paid</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Reports */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h2 className="font-bold text-white">Incoming Reports</h2>
          <div className="flex gap-2 text-xs">
            {stats.map((s) => (
              <div key={s.status} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded">
                <StatusBadge status={s.status} />
                <span className="text-white font-bold ml-1">{s._count}</span>
              </div>
            ))}
          </div>
        </div>

        {recentReports.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <p>No reports received yet.</p>
            <p className="text-sm mt-1">Create a program and researchers will start submitting.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-6 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Reporter</th>
                  <th className="text-left px-4 py-3 font-medium">Program</th>
                  <th className="text-left px-4 py-3 font-medium">Severity</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((report) => (
                  <tr
                    key={report.id}
                    className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/reports/${report.id}`}
                        className="text-white hover:text-green-400 text-sm font-medium line-clamp-1 transition-colors"
                      >
                        {report.title}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      @{report.reporter.username}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      <Link
                        href={`/programs/${report.program.slug}`}
                        className="hover:text-green-400"
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

      <div className="mt-4 text-center text-sm text-gray-600">
        {resolvedReports} vulnerabilities resolved
      </div>
    </div>
  );
}
