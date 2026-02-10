/**
 * Salt Storage - JSON file-based local database for storing commitment secrets
 *
 * During the commit phase, an agent generates a random salt and computes a hash.
 * The salt must be stored securely until the reveal phase.
 */

import * as fs from "fs";
import * as path from "path";

export interface SaltRecord {
  topic_id: number;
  salt: string; // hex-encoded
  prediction: number; // fixed-point value
  committed_at: number; // unix timestamp
  revealed: boolean;
}

interface LogEntry {
  id: number;
  topic_id: number;
  action: string;
  tx_signature: string | null;
  details: string | null;
  timestamp: number;
}

interface DBData {
  salts: Record<string, SaltRecord & { participant: string }>;
  log: LogEntry[];
}

export class SaltDB {
  private dbPath: string;
  private data: DBData;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), "poworth-salts.json");
    this.data = this.load();
  }

  private load(): DBData {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
      // Corrupted file, start fresh
    }
    return { salts: {}, log: [] };
  }

  private save(): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  private saltKey(topicId: number, participant: string): string {
    return `${topicId}:${participant}`;
  }

  /**
   * Store a salt after making a commitment
   */
  saveSalt(
    topicId: number,
    participant: string,
    salt: string,
    prediction: number
  ): void {
    const key = this.saltKey(topicId, participant);
    this.data.salts[key] = {
      topic_id: topicId,
      participant,
      salt,
      prediction,
      committed_at: Math.floor(Date.now() / 1000),
      revealed: false,
    };
    this.save();
  }

  /**
   * Retrieve a salt for the reveal phase
   */
  getSalt(topicId: number, participant: string): SaltRecord | null {
    const key = this.saltKey(topicId, participant);
    const record = this.data.salts[key];
    if (!record) return null;
    return {
      topic_id: record.topic_id,
      salt: record.salt,
      prediction: record.prediction,
      committed_at: record.committed_at,
      revealed: record.revealed,
    };
  }

  /**
   * Mark a salt as revealed
   */
  markRevealed(topicId: number, participant: string): void {
    const key = this.saltKey(topicId, participant);
    if (this.data.salts[key]) {
      this.data.salts[key].revealed = true;
      this.save();
    }
  }

  /**
   * Get all unrevealed commitments for a participant
   */
  getUnrevealedCommitments(participant: string): SaltRecord[] {
    return Object.values(this.data.salts)
      .filter((r) => r.participant === participant && !r.revealed)
      .map((r) => ({
        topic_id: r.topic_id,
        salt: r.salt,
        prediction: r.prediction,
        committed_at: r.committed_at,
        revealed: r.revealed,
      }));
  }

  /**
   * Log an agent action
   */
  logAction(
    topicId: number,
    action: string,
    txSignature?: string,
    details?: string
  ): void {
    this.data.log.push({
      id: this.data.log.length + 1,
      topic_id: topicId,
      action,
      tx_signature: txSignature || null,
      details: details || null,
      timestamp: Math.floor(Date.now() / 1000),
    });
    this.save();
  }

  /**
   * Get action log for a topic
   */
  getLog(topicId?: number): LogEntry[] {
    let entries = this.data.log;
    if (topicId !== undefined) {
      entries = entries.filter((e) => e.topic_id === topicId);
    }
    return entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100);
  }

  close(): void {
    // No-op for JSON storage, data is saved on each write
  }
}
