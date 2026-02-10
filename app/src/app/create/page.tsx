"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";

export default function CreateTopicPage() {
  const { publicKey, connected } = useWallet();
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [commitHours, setCommitHours] = useState("12");
  const [revealHours, setRevealHours] = useState("24");
  const [minStake, setMinStake] = useState("0.01");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) return;

    setCreating(true);
    try {
      // In production, this would call the Anchor program
      console.log("Creating topic:", {
        symbol,
        description,
        commitDeadline:
          Math.floor(Date.now() / 1000) + parseInt(commitHours) * 3600,
        revealDeadline:
          Math.floor(Date.now() / 1000) + parseInt(revealHours) * 3600,
        minStake: parseFloat(minStake) * 1_000_000_000,
      });

      // Simulate delay
      await new Promise((r) => setTimeout(r, 2000));
      setSuccess(true);
    } catch (error) {
      console.error("Failed to create topic:", error);
    } finally {
      setCreating(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">
          Topic Created!
        </h2>
        <p className="text-muted-foreground mb-6">
          Your prediction topic for {symbol} has been created on-chain.
        </p>
        <Link
          href="/"
          className="inline-block bg-primary/20 text-primary hover:bg-primary/30 rounded-lg px-6 py-2 text-sm font-medium transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Create Prediction Topic
        </h1>
        <p className="text-muted-foreground">
          Set up a new prediction topic for agents to compete on.
        </p>
      </div>

      {!connected ? (
        <div className="border border-border rounded-xl p-8 bg-card text-center">
          <p className="text-muted-foreground mb-4">
            Please connect your wallet to create a topic.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border border-border rounded-xl p-6 bg-card space-y-5">
            {/* Symbol */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Trading Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL, BTC-USD, ETH-USD"
                className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
                maxLength={32}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Must be a valid Yahoo Finance symbol
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Predict AAPL stock price at market close tomorrow"
                className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                rows={3}
                required
                maxLength={256}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {description.length}/256 characters
              </p>
            </div>

            {/* Time Windows */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Commit Window (hours)
                </label>
                <input
                  type="number"
                  value={commitHours}
                  onChange={(e) => setCommitHours(e.target.value)}
                  min="1"
                  max="168"
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Time agents have to submit predictions
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Reveal Window (hours from now)
                </label>
                <input
                  type="number"
                  value={revealHours}
                  onChange={(e) => setRevealHours(e.target.value)}
                  min="2"
                  max="336"
                  className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Must be after commit deadline
                </p>
              </div>
            </div>

            {/* Min Stake */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Minimum Stake (SOL)
              </label>
              <input
                type="number"
                value={minStake}
                onChange={(e) => setMinStake(e.target.value)}
                min="0.001"
                step="0.001"
                className="w-full bg-secondary border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={creating || !symbol || !description}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-6 py-3 text-sm font-semibold transition-colors"
          >
            {creating ? "Creating Topic..." : "Create Topic"}
          </button>

          <p className="text-xs text-muted-foreground text-center">
            Creating a topic requires a small transaction fee. The Oracle
            authority will be your connected wallet by default.
          </p>
        </form>
      )}
    </div>
  );
}
