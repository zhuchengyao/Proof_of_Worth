"use client";

import React, { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWorthHub } from "@/hooks/useWorthHub";
import {
  formatSOL,
  formatPrice,
  timeAgo,
  getStatusInfo,
  truncateKey,
} from "@/lib/utils";

export default function TopicDetail() {
  const params = useParams();
  const topicId = Number(params.id);
  const { topics, loading } = useWorthHub();

  const topic = useMemo(
    () => topics.find((t) => t.topicId === topicId),
    [topics, topicId]
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-secondary rounded w-1/4" />
          <div className="h-4 bg-secondary rounded w-2/3" />
          <div className="h-64 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Topic not found
        </h2>
        <p className="text-muted-foreground mb-4">
          Topic #{topicId} does not exist or has not been loaded.
        </p>
        <Link href="/" className="text-primary hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const statusInfo = getStatusInfo(topic.status);
  const now = Math.floor(Date.now() / 1000);

  // Progress bar
  const phases = [
    { label: "Commit", deadline: topic.commitDeadline, active: topic.status === 0 },
    { label: "Reveal", deadline: topic.revealDeadline, active: topic.status === 1 },
    { label: "Finalize", deadline: 0, active: topic.status === 2 },
    { label: "Settled", deadline: 0, active: topic.status === 3 },
  ];

  const currentPhaseIndex = topic.status;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back link */}
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-foreground">
              {topic.symbol}
            </h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full bg-secondary ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Topic #{topic.topicId}
            </span>
          </div>
          <p className="text-muted-foreground">{topic.description}</p>
        </div>
      </div>

      {/* Phase Progress */}
      <div className="border border-border rounded-xl p-5 bg-card mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Lifecycle Progress
        </h3>
        <div className="flex items-center gap-2">
          {phases.map((phase, i) => (
            <React.Fragment key={phase.label}>
              <div
                className={`flex-1 h-2 rounded-full ${
                  i <= currentPhaseIndex
                    ? "bg-primary"
                    : "bg-secondary"
                }`}
              />
              {i < phases.length - 1 && <div className="w-1" />}
            </React.Fragment>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {phases.map((phase, i) => (
            <div
              key={phase.label}
              className={`text-xs ${
                i === currentPhaseIndex
                  ? "text-primary font-semibold"
                  : i < currentPhaseIndex
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
              }`}
            >
              {phase.label}
            </div>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="text-xs text-muted-foreground">Total Stake</div>
          <div className="text-lg font-bold text-foreground">
            {formatSOL(topic.totalStake)} SOL
          </div>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="text-xs text-muted-foreground">Commitments</div>
          <div className="text-lg font-bold text-foreground">
            {topic.commitmentCount}
          </div>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="text-xs text-muted-foreground">Revealed</div>
          <div className="text-lg font-bold text-foreground">
            {topic.revealCount}/{topic.commitmentCount}
          </div>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="text-xs text-muted-foreground">
            {topic.status >= 2 ? "Truth Value" : "Min Stake"}
          </div>
          <div className="text-lg font-bold text-foreground">
            {topic.status >= 2
              ? `$${formatPrice(topic.truthValue)}`
              : `${formatSOL(topic.minStake)} SOL`}
          </div>
        </div>
      </div>

      {/* Deadlines */}
      <div className="border border-border rounded-xl p-5 bg-card mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Deadlines
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Commit Deadline
            </span>
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {new Date(topic.commitDeadline * 1000).toLocaleString()}
              </div>
              <div
                className={`text-xs ${
                  now < topic.commitDeadline
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {timeAgo(topic.commitDeadline)}
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Reveal Deadline
            </span>
            <div className="text-right">
              <div className="text-sm font-medium text-foreground">
                {new Date(topic.revealDeadline * 1000).toLocaleString()}
              </div>
              <div
                className={`text-xs ${
                  now < topic.revealDeadline
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {timeAgo(topic.revealDeadline)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Authority Info */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Authorities
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Topic Authority
            </span>
            <code className="text-xs text-foreground bg-secondary px-2 py-1 rounded">
              {truncateKey(topic.authority, 8)}
            </code>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              Oracle Authority
            </span>
            <code className="text-xs text-foreground bg-secondary px-2 py-1 rounded">
              {truncateKey(topic.oracleAuthority, 8)}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
