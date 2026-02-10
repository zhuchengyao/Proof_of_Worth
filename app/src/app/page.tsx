"use client";

import React from "react";
import { useWorthHub } from "@/hooks/useWorthHub";
import { TopicCard } from "@/components/TopicCard";
import { StatsBar } from "@/components/StatsBar";

export default function Dashboard() {
  const { topics, loading } = useWorthHub();

  const activeTopics = topics.filter((t) => t.status < 3);
  const totalStaked = topics.reduce((sum, t) => sum + t.totalStake, 0);
  const totalParticipants = topics.reduce(
    (sum, t) => sum + t.commitmentCount,
    0
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Prediction Dashboard
        </h1>
        <p className="text-muted-foreground">
          Stake, predict, and earn. The most accurate and earliest predictions
          win the highest rewards.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8">
        <StatsBar
          totalTopics={topics.length}
          activeTopics={activeTopics.length}
          totalStaked={totalStaked}
          totalParticipants={totalParticipants}
        />
      </div>

      {/* Topics Grid */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Active Prediction Topics
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="border border-border rounded-xl p-5 bg-card animate-pulse"
              >
                <div className="h-6 bg-secondary rounded w-1/3 mb-2" />
                <div className="h-4 bg-secondary rounded w-2/3 mb-4" />
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
                  <div className="h-8 bg-secondary rounded" />
                  <div className="h-8 bg-secondary rounded" />
                  <div className="h-8 bg-secondary rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topics
              .sort((a, b) => a.status - b.status)
              .map((topic) => (
                <TopicCard
                  key={topic.topicId}
                  topicId={topic.topicId}
                  symbol={topic.symbol}
                  description={topic.description}
                  status={topic.status}
                  totalStake={topic.totalStake}
                  commitmentCount={topic.commitmentCount}
                  revealCount={topic.revealCount}
                  commitDeadline={topic.commitDeadline}
                  revealDeadline={topic.revealDeadline}
                  truthValue={topic.truthValue}
                />
              ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="mt-12 border border-border rounded-xl p-6 bg-card">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          How PoWorth Works
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "Commit",
              desc: "Submit your prediction hash with SOL stake. Nobody sees your prediction yet.",
            },
            {
              step: "2",
              title: "Reveal",
              desc: "After the commit deadline, reveal your actual prediction and salt.",
            },
            {
              step: "3",
              title: "Verify",
              desc: "The Oracle fetches the real-world truth value from official data sources.",
            },
            {
              step: "4",
              title: "Settle",
              desc: "Rewards are distributed. More accurate + earlier = higher payout.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
                <span className="text-primary font-bold">{item.step}</span>
              </div>
              <div className="font-semibold text-foreground mb-1">
                {item.title}
              </div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
