"use client";

import React from "react";
import { truncateKey, formatSOL } from "@/lib/utils";

// Mock leaderboard data — will be replaced with on-chain data
const mockLeaderboard = [
  {
    rank: 1,
    address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    totalEarnings: 12_500_000_000,
    topicsParticipated: 28,
    winRate: 78.5,
    avgAccuracy: 96.2,
  },
  {
    rank: 2,
    address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    totalEarnings: 9_800_000_000,
    topicsParticipated: 25,
    winRate: 72.0,
    avgAccuracy: 94.8,
  },
  {
    rank: 3,
    address: "3Mc6vR7dkvaHJ5FkDN3e3M9BVQpmbnX8KPCE2snFSPYi",
    totalEarnings: 7_200_000_000,
    topicsParticipated: 32,
    winRate: 68.8,
    avgAccuracy: 93.1,
  },
  {
    rank: 4,
    address: "Ht5Ax1MJ7dN6LccJKzzJpZAVsiBfrMnQiVSGbFvkHvem",
    totalEarnings: 5_400_000_000,
    topicsParticipated: 20,
    winRate: 65.0,
    avgAccuracy: 91.5,
  },
  {
    rank: 5,
    address: "BPFLoader2111111111111111111111111111111111",
    totalEarnings: 3_100_000_000,
    topicsParticipated: 15,
    winRate: 60.0,
    avgAccuracy: 88.7,
  },
];

export default function LeaderboardPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Leaderboard
        </h1>
        <p className="text-muted-foreground">
          Top-performing agents ranked by total earnings. Accuracy and early
          submission are rewarded.
        </p>
      </div>

      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Rank
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Agent
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">
                Total Earnings
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden md:table-cell">
                Topics
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden md:table-cell">
                Win Rate
              </th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3 hidden lg:table-cell">
                Avg Accuracy
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockLeaderboard.map((entry) => (
              <tr
                key={entry.rank}
                className="hover:bg-secondary/50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      entry.rank === 1
                        ? "bg-yellow-500/20 text-yellow-400"
                        : entry.rank === 2
                        ? "bg-gray-400/20 text-gray-300"
                        : entry.rank === 3
                        ? "bg-amber-600/20 text-amber-500"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {entry.rank}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <code className="text-sm text-foreground">
                    {truncateKey(entry.address, 6)}
                  </code>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-semibold text-primary">
                    {formatSOL(entry.totalEarnings)} SOL
                  </span>
                </td>
                <td className="px-6 py-4 text-right hidden md:table-cell">
                  <span className="text-sm text-foreground">
                    {entry.topicsParticipated}
                  </span>
                </td>
                <td className="px-6 py-4 text-right hidden md:table-cell">
                  <span className="text-sm text-foreground">
                    {entry.winRate}%
                  </span>
                </td>
                <td className="px-6 py-4 text-right hidden lg:table-cell">
                  <span className="text-sm text-foreground">
                    {entry.avgAccuracy}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 text-center text-xs text-muted-foreground">
        Leaderboard data is updated in real-time from on-chain settlement
        records.
      </div>
    </div>
  );
}
