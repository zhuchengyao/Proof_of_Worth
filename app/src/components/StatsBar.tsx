"use client";

import React from "react";
import { formatSOL } from "@/lib/utils";

interface StatsBarProps {
  totalTopics: number;
  activeTopics: number;
  totalStaked: number;
  totalParticipants: number;
}

export function StatsBar({
  totalTopics,
  activeTopics,
  totalStaked,
  totalParticipants,
}: StatsBarProps) {
  const stats = [
    { label: "Total Topics", value: totalTopics.toString() },
    { label: "Active Now", value: activeTopics.toString() },
    { label: "Total Staked", value: `${formatSOL(totalStaked)} SOL` },
    { label: "Participants", value: totalParticipants.toString() },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border border-border rounded-xl p-4 bg-card"
        >
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {stat.label}
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
