/**
 * PoWorth Protocol Types
 *
 * All agents must use this JSON-RPC style message structure
 * for communication with the protocol.
 */

export const PROTOCOL_VERSION = "0.1.0" as const;

// Fixed-point precision: all prediction/truth values are multiplied by this
export const VALUE_PRECISION = 1_000_000;

// Minimum stake in lamports (0.01 SOL)
export const DEFAULT_MIN_STAKE = 10_000_000;

// ─── Topic Status ───────────────────────────────────────────────────

export enum TopicStatus {
  Open = 0,
  Revealing = 1,
  Finalized = 2,
  Settled = 3,
}

// ─── Protocol Actions ───────────────────────────────────────────────

export type ProtocolAction =
  | "create_topic"
  | "commit"
  | "reveal"
  | "finalize"
  | "settle"
  | "query_topic"
  | "query_commitment";

// ─── Payloads ───────────────────────────────────────────────────────

export interface CreateTopicPayload {
  topic_id: number;
  description: string;
  symbol: string;
  commit_deadline: number; // Unix timestamp
  reveal_deadline: number; // Unix timestamp
  min_stake: number; // lamports
  oracle_authority: string; // base58 pubkey
}

export interface CommitPayload {
  topic_id: number;
  commitment_hash: string; // hex-encoded 32 bytes
  stake_amount: number; // lamports
}

export interface RevealPayload {
  topic_id: number;
  prediction_value: number; // fixed-point (raw * 1e6)
  salt: string; // hex-encoded 32 bytes
}

export interface FinalizePayload {
  topic_id: number;
  truth_value: number; // fixed-point (raw * 1e6)
}

export interface SettlePayload {
  topic_id: number;
}

export interface QueryTopicPayload {
  topic_id: number;
}

export interface QueryCommitmentPayload {
  topic_id: number;
  participant: string; // base58 pubkey
}

// ─── Protocol Message ───────────────────────────────────────────────

export type ProtocolPayload =
  | CreateTopicPayload
  | CommitPayload
  | RevealPayload
  | FinalizePayload
  | SettlePayload
  | QueryTopicPayload
  | QueryCommitmentPayload;

export interface PoWorthMessage<T extends ProtocolPayload = ProtocolPayload> {
  protocol_version: typeof PROTOCOL_VERSION;
  action: ProtocolAction;
  payload: T;
  timestamp: number;
  sender: string; // base58 public key
  signature?: string; // optional message signature
}

// ─── Response Types ─────────────────────────────────────────────────

export interface TopicInfo {
  topic_id: number;
  authority: string;
  oracle_authority: string;
  description: string;
  symbol: string;
  commit_deadline: number;
  reveal_deadline: number;
  status: TopicStatus;
  truth_value: number;
  total_stake: number;
  commitment_count: number;
  reveal_count: number;
  min_stake: number;
}

export interface CommitmentInfo {
  topic: string;
  participant: string;
  commitment_hash: string;
  stake_amount: number;
  submit_order: number;
  prediction_value: number;
  revealed: boolean;
  settled: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Convert a real-world value to fixed-point representation
 * e.g., 150.25 -> 150_250_000
 */
export function toFixedPoint(value: number): number {
  return Math.round(value * VALUE_PRECISION);
}

/**
 * Convert a fixed-point value back to real-world representation
 * e.g., 150_250_000 -> 150.25
 */
export function fromFixedPoint(value: number): number {
  return value / VALUE_PRECISION;
}

/**
 * Create a PoWorth protocol message
 */
export function createMessage<T extends ProtocolPayload>(
  action: ProtocolAction,
  payload: T,
  sender: string,
): PoWorthMessage<T> {
  return {
    protocol_version: PROTOCOL_VERSION,
    action,
    payload,
    timestamp: Math.floor(Date.now() / 1000),
    sender,
  };
}
