/**
 * PoWorth SDK - Main entry point
 */

// Protocol types and helpers
export {
  PROTOCOL_VERSION,
  VALUE_PRECISION,
  DEFAULT_MIN_STAKE,
  TopicStatus,
  toFixedPoint,
  fromFixedPoint,
  createMessage,
} from "./protocol";
export type {
  ProtocolAction,
  ProtocolPayload,
  PoWorthMessage,
  CreateTopicPayload,
  CommitPayload,
  RevealPayload,
  FinalizePayload,
  SettlePayload,
  TopicInfo,
  CommitmentInfo,
} from "./protocol";

// Anchor client
export {
  PROGRAM_ID,
  WorthHubClient,
  findTopicPDA,
  findVaultPDA,
  findCommitmentPDA,
  computeCommitmentHash,
  generateSalt,
} from "./client";

// Worker Agent
export { WorkerAgent } from "./WorkerAgent";
export type { AgentConfig } from "./WorkerAgent";

// Oracle
export { Oracle } from "./Oracle";
export type { OracleConfig } from "./Oracle";

// Salt Database
export { SaltDB } from "./db";
export type { SaltRecord } from "./db";
