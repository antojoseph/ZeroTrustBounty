import { prisma } from "@/lib/prisma";

async function getLeaderboard() {
  const researchers = await prisma.user.findMany({
    where: { role: "researcher" },
    orderBy: { reputation: "desc" },
    take: 50,
    select: {
      id: true,
      username: true,
      displayName: true,
      reputation: true,
      createdAt: true,
      _count: { select: { reports: true } },
      payments: { where: { status: "paid" }, select: { amount: true } },
    },
  });

  return researchers.map((r) => ({
    ...r,
    totalEarned: r.payments.reduce((sum, p) => sum + p.amount, 0),
    reportCount: r._count.reports,
  }));
}

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();

  const medalColors = ["text-yellow-400", "text-gray-400", "text-orange-500"];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Researcher Leaderboard</h1>
        <p className="text-gray-400">
          Top security researchers ranked by reputation
        </p>
      </div>

      {/* Top 3 */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[1, 0, 2].map((i) => {
            const r = leaderboard[i];
            const rank = i + 1;
            return (
              <div
                key={r.id}
                className={`bg-gray-900 border rounded-xl p-6 text-center ${
                  i === 0
                    ? "border-yellow-600/50 bg-yellow-950/10 row-start-1"
                    : "border-gray-800 mt-6"
                }`}
              >
                <div className={`text-4xl mb-2 ${medalColors[i]}`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                </div>
                <div className="w-14 h-14 bg-gray-800 rounded-full flex items-center justify-center text-xl font-bold text-green-400 mx-auto mb-3 border-2 border-gray-700">
                  {r.displayName[0]}
                </div>
                <p className="font-bold text-white">{r.displayName}</p>
                <p className="text-xs text-gray-500 mb-2">@{r.username}</p>
                <p className="text-green-400 font-bold">{r.reputation.toLocaleString()} pts</p>
                <p className="text-xs text-gray-500">${r.totalEarned.toLocaleString()} earned</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="text-left px-6 py-3 font-medium">Rank</th>
              <th className="text-left px-4 py-3 font-medium">Researcher</th>
              <th className="text-right px-4 py-3 font-medium">Reputation</th>
              <th className="text-right px-4 py-3 font-medium">Reports</th>
              <th className="text-right px-6 py-3 font-medium">Earned</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-gray-500">
                  No researchers yet. Be the first!
                </td>
              </tr>
            ) : (
              leaderboard.map((researcher, index) => (
                <tr
                  key={researcher.id}
                  className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span
                      className={`font-bold text-sm ${
                        index < 3 ? medalColors[index] : "text-gray-500"
                      }`}
                    >
                      #{index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-sm font-bold text-green-400 border border-gray-700 shrink-0">
                        {researcher.displayName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-white text-sm">
                          {researcher.displayName}
                        </p>
                        <p className="text-xs text-gray-500">@{researcher.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <span className="text-green-400 font-semibold text-sm">
                      {researcher.reputation.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-sm text-gray-400">
                    {researcher.reportCount}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-gray-300 font-medium">
                      ${researcher.totalEarned.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
