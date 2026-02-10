"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// Program ID — must match Anchor.toml and lib.rs
const PROGRAM_ID = new PublicKey(
  "8qXNZGRTwYeAw3fdPsaqJ3cq5ieyZWtxrXTZizmuZFeQ"
);

export interface TopicAccount {
  publicKey: string;
  topicId: number;
  authority: string;
  oracleAuthority: string;
  description: string;
  symbol: string;
  commitDeadline: number;
  revealDeadline: number;
  status: number;
  truthValue: number;
  totalStake: number;
  commitmentCount: number;
  revealCount: number;
  minStake: number;
}

function mapStatus(status: any): number {
  if (status.open) return 0;
  if (status.revealing) return 1;
  if (status.finalized) return 2;
  if (status.settled) return 3;
  return 0;
}

export function useWorthHub() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [topics, setTopics] = useState<TopicAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use raw getProgramAccounts to fetch topic accounts
      // discriminator for Topic = first 8 bytes of sha256("account:Topic")
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          {
            // Filter by account size to get only Topic accounts
            dataSize: 416, // approximate Topic account size
          },
        ],
      });

      // For now, return mock data if program isn't deployed
      if (accounts.length === 0) {
        setTopics(getMockTopics());
      } else {
        // Parse real account data when program is deployed
        const parsed: TopicAccount[] = accounts.map((a) => {
          // This would use the IDL to deserialize
          return {
            publicKey: a.pubkey.toBase58(),
            topicId: 0,
            authority: "",
            oracleAuthority: "",
            description: "",
            symbol: "",
            commitDeadline: 0,
            revealDeadline: 0,
            status: 0,
            truthValue: 0,
            totalStake: 0,
            commitmentCount: 0,
            revealCount: 0,
            minStake: 0,
          };
        });
        setTopics(parsed);
      }
    } catch (err) {
      console.error("Failed to fetch topics:", err);
      // Use mock data when not connected
      setTopics(getMockTopics());
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    fetchTopics();
    const interval = setInterval(fetchTopics, 15000);
    return () => clearInterval(interval);
  }, [fetchTopics]);

  return { topics, loading, error, refresh: fetchTopics };
}

/**
 * Mock data for development when program isn't deployed
 */
function getMockTopics(): TopicAccount[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      publicKey: "mock1",
      topicId: 1,
      authority: "11111111111111111111111111111111",
      oracleAuthority: "22222222222222222222222222222222",
      description: "Predict AAPL stock price at market close tomorrow",
      symbol: "AAPL",
      commitDeadline: now + 3600,
      revealDeadline: now + 7200,
      status: 0,
      truthValue: 0,
      totalStake: 5_000_000_000,
      commitmentCount: 12,
      revealCount: 0,
      minStake: 10_000_000,
    },
    {
      publicKey: "mock2",
      topicId: 2,
      authority: "11111111111111111111111111111111",
      oracleAuthority: "22222222222222222222222222222222",
      description: "Predict BTC-USD price in 24 hours",
      symbol: "BTC-USD",
      commitDeadline: now - 1800,
      revealDeadline: now + 1800,
      status: 1,
      truthValue: 0,
      totalStake: 25_000_000_000,
      commitmentCount: 34,
      revealCount: 21,
      minStake: 50_000_000,
    },
    {
      publicKey: "mock3",
      topicId: 3,
      authority: "11111111111111111111111111111111",
      oracleAuthority: "22222222222222222222222222222222",
      description: "Predict ETH-USD price at end of week",
      symbol: "ETH-USD",
      commitDeadline: now - 86400,
      revealDeadline: now - 43200,
      status: 2,
      truthValue: 3_250_000_000,
      totalStake: 15_000_000_000,
      commitmentCount: 23,
      revealCount: 19,
      minStake: 10_000_000,
    },
    {
      publicKey: "mock4",
      topicId: 4,
      authority: "11111111111111111111111111111111",
      oracleAuthority: "22222222222222222222222222222222",
      description: "Predict TSLA earnings per share Q4",
      symbol: "TSLA",
      commitDeadline: now - 172800,
      revealDeadline: now - 86400,
      status: 3,
      truthValue: 1_290_000,
      totalStake: 8_000_000_000,
      commitmentCount: 18,
      revealCount: 15,
      minStake: 10_000_000,
    },
  ];
}
