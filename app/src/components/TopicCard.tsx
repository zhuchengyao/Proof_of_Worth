"use client";

import React from "react";
import Link from "next/link";
import { formatSOL, formatPrice, timeAgo, getStatusInfo } from "@/lib/utils";

interface TopicCardProps {
  topicId: number;
  symbol: string;
  description: string;
  status: number;
  totalStake: number;
  commitmentCount: number;
  revealCount: number;
  commitDeadline: number;
  revealDeadline: number;
  truthValue: number;
}

export function TopicCard({
  topicId,
  symbol,
  description,
  status,
  totalStake,
  commitmentCount,
  revealCount,
  commitDeadline,
  revealDeadline,
  truthValue,
}: TopicCardProps) {
  const statusInfo = getStatusInfo(status);
  const now = Math.floor(Date.now() / 1000);

  const getPhaseInfo = () => {
    if (status === 3) return { label: "Settled", sub: "" };
    if (status === 2) return { label: "Awaiting Settlement", sub: "" };
    if (now < commitDeadline) {
      return { label: "Commit Phase", sub: timeAgo(commitDeadline) };
    }
    if (now < revealDeadline) {
      return { label: "Reveal Phase", sub: timeAgo(revealDeadline) };
    }
    return { label: "Awaiting Oracle", sub: "" };
  };

  const phase = getPhaseInfo();

  return (
    <Link href={`/topic/${topicId}`}>
      <div className="group border border-border rounded-xl p-5 bg-card hover:border-primary/50 transition-all duration-200 cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-foreground">
                {symbol}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full bg-secondary ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">{phase.label}</div>
            {phase.sub && (
              <div className="text-xs text-primary font-medium">
                {phase.sub}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-border">
          <div>
            <div className="text-xs text-muted-foreground">Total Stake</div>
            <div className="text-sm font-semibold text-foreground">
              {formatSOL(totalStake)} SOL
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Participants</div>
            <div className="text-sm font-semibold text-foreground">
              {revealCount}/{commitmentCount}
              <span className="text-xs text-muted-foreground ml-1">
                revealed
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {status >= 2 ? "Truth" : "Topic ID"}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {status >= 2 ? `$${formatPrice(truthValue)}` : `#${topicId}`}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
