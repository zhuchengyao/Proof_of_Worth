/**
 * Oracle - Truth Provider
 *
 * A trusted automated script that:
 * 1. Monitors topics that need finalization
 * 2. Fetches real-world data from Yahoo Finance
 * 3. Submits the truth value to the contract
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import yahooFinance from "yahoo-finance2";
import {
  WorthHubClient,
  findTopicPDA,
  findCommitmentPDA,
} from "./client";
import {
  TopicInfo,
  TopicStatus,
  toFixedPoint,
  fromFixedPoint,
} from "./protocol";

export interface OracleConfig {
  /** Oracle keypair (must match oracle_authority in topics) */
  keypair: Keypair;
  /** Polling interval in ms */
  pollIntervalMs?: number;
}

export class Oracle {
  private client: WorthHubClient;
  private keypair: Keypair;
  private pollInterval: number;
  private running: boolean = false;

  constructor(config: OracleConfig, client: WorthHubClient) {
    this.keypair = config.keypair;
    this.client = client;
    this.pollInterval = config.pollIntervalMs || 15_000;
  }

  // ─── Data Fetching ────────────────────────────────────────────────

  /**
   * Fetch the current price of a symbol from Yahoo Finance
   *
   * @param symbol - Trading symbol (e.g., "AAPL", "BTC-USD", "ETH-USD")
   * @returns The current market price
   */
  async fetchTruth(symbol: string): Promise<number> {
    try {
      const quote = await yahooFinance.quote(symbol);

      if (!quote || !quote.regularMarketPrice) {
        throw new Error(`No price data for symbol: ${symbol}`);
      }

      const price = quote.regularMarketPrice;
      console.log(
        `[Oracle] Fetched price for ${symbol}: $${price} ` +
        `(market: ${quote.fullExchangeName || "unknown"}, ` +
        `time: ${quote.regularMarketTime || "unknown"})`
      );

      return price;
    } catch (error) {
      console.error(`[Oracle] Failed to fetch price for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Fetch historical price at a specific date
   */
  async fetchHistoricalPrice(
    symbol: string,
    date: Date
  ): Promise<number> {
    try {
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 1);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      const result = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: endDate,
      });

      if (!result || result.length === 0) {
        throw new Error(`No historical data for ${symbol} on ${date.toISOString()}`);
      }

      // Get closest date's close price
      const price = result[result.length - 1].close;
      console.log(
        `[Oracle] Historical price for ${symbol} at ${date.toISOString()}: $${price}`
      );
      return price;
    } catch (error) {
      console.error(`[Oracle] Failed to fetch historical price:`, error);
      throw error;
    }
  }

  // ─── On-chain Interactions ────────────────────────────────────────

  /**
   * Submit truth value to finalize a topic
   */
  async submitTruth(topicId: number, truthValue: number): Promise<string> {
    const fixedValue = toFixedPoint(truthValue);

    try {
      const tx = await this.client.finalize(
        this.keypair,
        topicId,
        fixedValue
      );
      console.log(
        `[Oracle] Finalized topic ${topicId}: truth=${truthValue} (fixed=${fixedValue}), tx=${tx}`
      );
      return tx;
    } catch (error) {
      console.error(`[Oracle] Failed to finalize topic ${topicId}:`, error);
      throw error;
    }
  }

  /**
   * Trigger settlement for a finalized topic
   *
   * @param topicId - The topic to settle
   * @param participants - List of participant public keys
   */
  async triggerSettle(
    topicId: number,
    participants: PublicKey[]
  ): Promise<string> {
    const [topicPDA] = findTopicPDA(topicId);
    const pairs: [PublicKey, PublicKey][] = participants.map((p) => [
      findCommitmentPDA(topicPDA, p)[0],
      p,
    ]);

    try {
      const tx = await this.client.settle(this.keypair, topicId, pairs);
      console.log(
        `[Oracle] Settled topic ${topicId}: ${participants.length} participants, tx=${tx}`
      );
      return tx;
    } catch (error) {
      console.error(`[Oracle] Failed to settle topic ${topicId}:`, error);
      throw error;
    }
  }

  // ─── Monitoring Loop ──────────────────────────────────────────────

  /**
   * Start the oracle monitoring loop
   */
  async start(): Promise<void> {
    this.running = true;
    console.log(
      `[Oracle] Started. Authority: ${this.keypair.publicKey.toBase58()}`
    );

    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        console.error("[Oracle] Tick error:", error);
      }
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    this.running = false;
    console.log("[Oracle] Stopped.");
  }

  /**
   * Single monitoring cycle
   */
  async tick(): Promise<void> {
    const topics = await this.client.fetchAllTopics();
    const now = Math.floor(Date.now() / 1000);

    for (const topic of topics) {
      // Check if oracle authority matches
      if (topic.oracle_authority !== this.keypair.publicKey.toBase58()) {
        continue;
      }

      // Finalize: topic is past reveal deadline and not yet finalized
      if (
        (topic.status === TopicStatus.Open ||
          topic.status === TopicStatus.Revealing) &&
        now >= topic.reveal_deadline
      ) {
        console.log(
          `[Oracle] Topic ${topic.topic_id} (${topic.symbol}) ready for finalization`
        );
        try {
          const truth = await this.fetchTruth(topic.symbol);
          await this.submitTruth(topic.topic_id, truth);
        } catch (error) {
          console.error(
            `[Oracle] Failed to finalize topic ${topic.topic_id}:`,
            error
          );
        }
      }
    }
  }

  /**
   * Get oracle info
   */
  getInfo(): { publicKey: string } {
    return {
      publicKey: this.keypair.publicKey.toBase58(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
