import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getStats() {
  const [programs, reports, researchers, totalPaid] = await Promise.all([
    prisma.program.count({ where: { status: "active" } }),
    prisma.report.count(),
    prisma.user.count({ where: { role: "researcher" } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "paid" } }),
  ]);
  return { programs, reports, researchers, totalPaid: totalPaid._sum.amount || 0 };
}

async function getRecentPrograms() {
  return prisma.program.findMany({
    where: { status: "active" },
    take: 6,
    orderBy: { createdAt: "desc" },
    include: {
      company: { select: { name: true, verified: true } },
      _count: { select: { reports: true } },
    },
  });
}

export default async function HomePage() {
  const [stats, recentPrograms] = await Promise.all([getStats(), getRecentPrograms()]);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-900 to-green-950 py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700/50 text-green-400 text-sm px-4 py-1.5 rounded-full mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            Responsible Disclosure Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Find Bugs,
            <span className="text-green-400"> Earn Bounties</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Connect security researchers with companies. Report vulnerabilities responsibly
            and get rewarded for making the internet safer.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/programs"
              className="bg-green-500 hover:bg-green-400 text-black font-bold px-8 py-3 rounded-xl text-lg transition-colors w-full sm:w-auto"
            >
              Browse Programs
            </Link>
            <Link
              href="/register"
              className="border border-gray-600 hover:border-green-500 text-gray-300 hover:text-white font-semibold px-8 py-3 rounded-xl text-lg transition-colors w-full sm:w-auto"
            >
              Join as Researcher
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gray-900 border-y border-gray-800 py-12 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { label: "Active Programs", value: stats.programs.toLocaleString() },
            { label: "Reports Submitted", value: stats.reports.toLocaleString() },
            { label: "Researchers", value: stats.researchers.toLocaleString() },
            { label: "Total Paid Out", value: `$${stats.totalPaid.toLocaleString()}` },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-bold text-green-400">{stat.value}</div>
              <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Programs */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-white">Featured Programs</h2>
          <Link href="/programs" className="text-green-400 hover:text-green-300 text-sm">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recentPrograms.map((program) => (
            <Link
              key={program.id}
              href={`/programs/${program.slug}`}
              className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-700 transition-all hover:-translate-y-0.5 group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-xl font-bold text-green-400 border border-gray-700">
                  {program.company.name[0]}
                </div>
                {program.company.verified && (
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
              <h3 className="font-bold text-white text-lg mb-1 group-hover:text-green-400 transition-colors">
                {program.name}
              </h3>
              <p className="text-sm text-gray-500 mb-1">{program.company.name}</p>
              <p className="text-sm text-gray-400 line-clamp-2 mb-4">{program.description}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-400 font-semibold">
                  ${program.minBounty.toLocaleString()} – ${program.maxBounty.toLocaleString()}
                </span>
                <span className="text-gray-500">{program._count.reports} reports</span>
              </div>
            </Link>
          ))}
        </div>
        {recentPrograms.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No programs yet.</p>
            <Link href="/register" className="text-green-400 hover:underline mt-2 inline-block">
              Register as a company to create the first program →
            </Link>
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="bg-gray-900 border-t border-gray-800 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: "🔍",
                title: "Find a Program",
                desc: "Browse active bug bounty programs from companies across industries. Filter by bounty range, scope, and more.",
              },
              {
                icon: "🐛",
                title: "Report a Vulnerability",
                desc: "Discover a security issue? Submit a detailed, responsible disclosure report with reproduction steps and impact.",
              },
              {
                icon: "💰",
                title: "Earn Your Bounty",
                desc: "Get rewarded based on severity. Build your reputation on the leaderboard and grow your security career.",
              },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-4 text-center text-gray-500 text-sm">
        <p>BountyBoard &copy; {new Date().getFullYear()} — Responsible Disclosure Platform</p>
      </footer>
    </div>
  );
}
