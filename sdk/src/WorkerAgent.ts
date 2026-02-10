/**
 * WorkerAgent - The autonomous prediction agent
 *
 * Each agent:
 * 1. Monitors the chain for new topics
 * 2. Uses OpenAI to generate predictions
 * 3. Commits predictions with stake
 * 4. Reveals predictions when the window opens
 */

import { Keypair, PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import OpenAI from "openai";
import {
  WorthHubClient,
  computeCommitmentHash,
  generateSalt,
  findTopicPDA,
  findCommitmentPDA,
} from "./client";
import { SaltDB } from "./db";
import {
  TopicInfo,
  TopicStatus,
  toFixedPoint,
  fromFixedPoint,
  createMessage,
} from "./protocol";

export interface AgentConfig {
  /** Agent name for logging */
  name: string;
  /** Solana keypair (private key) */
  keypair: Keypair;
  /** OpenAI API key */
  openaiApiKey: string;
  /** OpenAI model to use */
  openaiModel?: string;
  /** Default stake amount in SOL */
  defaultStakeSOL?: number;
  /** SQLite database path */
  dbPath?: string;
  /** Polling interval in ms */
  pollIntervalMs?: number;
}

export class WorkerAgent {
  public name: string;
  public keypair: Keypair;
  private client: WorthHubClient;
  private openai: OpenAI;
  private db: SaltDB;
  private model: string;
  private defaultStake: number;
  private pollInterval: number;
  private running: boolean = false;

  constructor(config: AgentConfig, client: WorthHubClient) {
    this.name = config.name;
    this.keypair = config.keypair;
    this.client = client;
    this.model = config.openaiModel || "gpt-4";
    this.defaultStake = (config.defaultStakeSOL || 0.1) * LAMPORTS_PER_SOL;
    this.pollInterval = config.pollIntervalMs || 10_000;

    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    this.db = new SaltDB(config.dbPath);
  }

  // ─── Brain: LLM-based prediction ─────────────────────────────────

  /**
   * Use OpenAI to analyze a topic and generate a price prediction
   */
  async analyze(topic: TopicInfo): Promise<number> {
    const prompt = `You are a quantitative financial analyst. Given the following prediction task, provide your best estimate.

Topic: ${topic.description}
Symbol: ${topic.symbol}
Current time: ${new Date().toISOString()}

You must respond with ONLY a single number representing your prediction.
For stock/crypto prices, give the price in USD.
Do not include any text, explanation, or currency symbols. Just the number.

Example response: 152.37`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 50,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      if (!response) throw new Error("Empty LLM response");

      const value = parseFloat(response);
      if (isNaN(value)) throw new Error(`Invalid LLM response: ${response}`);

      console.log(`[${this.name}] LLM prediction for ${topic.symbol}: ${value}`);
      return value;
    } catch (error) {
      console.error(`[${this.name}] LLM analysis failed:`, error);
      // Fallback: return a random value near a reasonable range
      return this.fallbackPrediction(topic);
    }
  }

  /**
   * Fallback prediction when LLM is unavailable
   */
  private fallbackPrediction(topic: TopicInfo): number {
    // Generate a somewhat random prediction
    const base = 100 + Math.random() * 200;
    console.log(`[${this.name}] Using fallback prediction: ${base.toFixed(2)}`);
    return parseFloat(base.toFixed(2));
  }

  // ─── Blockchain: on-chain interactions ────────────────────────────

  /**
   * Commit a prediction to a topic
   */
  async commitPrediction(
    topicId: number,
    prediction: number,
    stakeAmount?: number
  ): Promise<string> {
    const stake = stakeAmount || this.defaultStake;
    const fixedPrediction = toFixedPoint(prediction);
    const salt = generateSalt();

    // Compute commitment hash
    const hash = computeCommitmentHash(
      fixedPrediction,
      salt,
      this.keypair.publicKey
    );

    // Store salt locally BEFORE submitting on-chain
    this.db.saveSalt(
      topicId,
      this.keypair.publicKey.toBase58(),
      salt.toString("hex"),
      fixedPrediction
    );

    try {
      // Submit commitment on-chain
      const tx = await this.client.commit(this.keypair, topicId, hash, stake);

      this.db.logAction(topicId, "commit", tx, JSON.stringify({
        prediction: fromFixedPoint(fixedPrediction),
        stake: stake / LAMPORTS_PER_SOL,
      }));

      console.log(
        `[${this.name}] Committed to topic ${topicId}: prediction=${prediction}, stake=${stake / LAMPORTS_PER_SOL} SOL, tx=${tx}`
      );
      return tx;
    } catch (error) {
      console.error(`[${this.name}] Commit failed:`, error);
      throw error;
    }
  }

  /**
   * Reveal a previously committed prediction
   */
  async revealPrediction(topicId: number): Promise<string> {
    const participant = this.keypair.publicKey.toBase58();
    const record = this.db.getSalt(topicId, participant);

    if (!record) {
      throw new Error(`No salt found for topic ${topicId}`);
    }
    if (record.revealed) {
      throw new Error(`Already revealed for topic ${topicId}`);
    }

    const salt = Buffer.from(record.salt, "hex");
    const predictionValue = record.prediction;

    try {
      const tx = await this.client.reveal(
        this.keypair,
        topicId,
        predictionValue,
        salt
      );

      this.db.markRevealed(topicId, participant);
      this.db.logAction(topicId, "reveal", tx, JSON.stringify({
        prediction: fromFixedPoint(predictionValue),
      }));

      console.log(
        `[${this.name}] Revealed topic ${topicId}: prediction=${fromFixedPoint(predictionValue)}, tx=${tx}`
      );
      return tx;
    } catch (error) {
      console.error(`[${this.name}] Reveal failed:`, error);
      throw error;
    }
  }

  // ─── Monitor: autonomous operation ────────────────────────────────

  /**
   * Start the autonomous monitoring loop
   */
  async start(): Promise<void> {
    this.running = true;
    console.log(`[${this.name}] Agent started. Monitoring for topics...`);

    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        console.error(`[${this.name}] Tick error:`, error);
      }
      await this.sleep(this.pollInterval);
    }
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    this.running = false;
    console.log(`[${this.name}] Agent stopped.`);
  }

  /**
   * Single monitoring cycle
   */
  async tick(): Promise<void> {
    const topics = await this.client.fetchAllTopics();
    const now = Math.floor(Date.now() / 1000);
    const participant = this.keypair.publicKey.toBase58();

    for (const topic of topics) {
      // Phase 1: Commit to open topics
      if (topic.status === TopicStatus.Open && now < topic.commit_deadline) {
        const existing = this.db.getSalt(topic.topic_id, participant);
        if (!existing) {
          console.log(`[${this.name}] New topic found: ${topic.symbol} (id=${topic.topic_id})`);
          try {
            const prediction = await this.analyze(topic);
            await this.commitPrediction(topic.topic_id, prediction);
          } catch (error) {
            console.error(
              `[${this.name}] Failed to commit to topic ${topic.topic_id}:`,
              error
            );
          }
        }
      }

      // Phase 2: Reveal committed topics
      if (
        (topic.status === TopicStatus.Open ||
          topic.status === TopicStatus.Revealing) &&
        now >= topic.commit_deadline &&
        now < topic.reveal_deadline
      ) {
        const record = this.db.getSalt(topic.topic_id, participant);
        if (record && !record.revealed) {
          console.log(
            `[${this.name}] Reveal window open for topic ${topic.topic_id}`
          );
          try {
            await this.revealPrediction(topic.topic_id);
          } catch (error) {
            console.error(
              `[${this.name}] Failed to reveal topic ${topic.topic_id}:`,
              error
            );
          }
        }
      }
    }
  }

  /**
   * Get agent's SOL balance
   */
  async getBalance(): Promise<number> {
    const balance = await this.client.connection.getBalance(
      this.keypair.publicKey
    );
    return balance / LAMPORTS_PER_SOL;
  }

  /**
   * Get agent info for display
   */
  getInfo(): { name: string; publicKey: string } {
    return {
      name: this.name,
      publicKey: this.keypair.publicKey.toBase58(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  destroy(): void {
    this.running = false;
    this.db.close();
  }
}
