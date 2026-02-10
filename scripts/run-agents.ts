/**
 * PoWorth Demo: Multi-Agent Competition Simulation
 *
 * This script:
 * 1. Sets up a local Solana environment
 * 2. Deploys/connects to the WorthHub program
 * 3. Creates a prediction topic
 * 4. Spawns 3 WorkerAgents that compete
 * 5. Runs an Oracle to finalize
 * 6. Settles and prints PnL for each agent
 *
 * Prerequisites:
 * - Local Solana validator running: `solana-test-validator`
 * - Program deployed: `anchor deploy`
 * - OPENAI_API_KEY in .env (optional, will use mock predictions without it)
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

import {
  WorthHubClient,
  findTopicPDA,
  findVaultPDA,
  findCommitmentPDA,
  computeCommitmentHash,
  generateSalt,
  toFixedPoint,
  fromFixedPoint,
} from "../sdk/src";
import { SaltDB } from "../sdk/src/db";

dotenv.config();

// ─── Configuration ──────────────────────────────────────────────────

const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const TOPIC_ID = Math.floor(Math.random() * 1_000_000);
const STAKE_AMOUNT = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL each
const SYMBOL = "AAPL";

// Time windows (seconds)
const COMMIT_WINDOW = 10; // 10 seconds for demo
const REVEAL_WINDOW = 20; // 20 seconds total (10s reveal after commit)

console.log("=".repeat(60));
console.log("  PoWorth Demo: Multi-Agent Competition");
console.log("=".repeat(60));
console.log();

async function main() {
  // ─── Setup ──────────────────────────────────────────────────────

  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`Connected to: ${RPC_URL}`);

  // Generate keypairs
  const authority = Keypair.generate();
  const oracle = Keypair.generate();
  const agents = [
    { name: "Agent-Alpha", keypair: Keypair.generate(), prediction: 0, salt: Buffer.alloc(0) },
    { name: "Agent-Beta", keypair: Keypair.generate(), prediction: 0, salt: Buffer.alloc(0) },
    { name: "Agent-Gamma", keypair: Keypair.generate(), prediction: 0, salt: Buffer.alloc(0) },
  ];

  // Airdrop SOL to all accounts
  console.log("\n[Setup] Airdropping SOL to participants...");
  const airdropPromises = [
    connection.requestAirdrop(authority.publicKey, 5 * LAMPORTS_PER_SOL),
    connection.requestAirdrop(oracle.publicKey, 2 * LAMPORTS_PER_SOL),
    ...agents.map((a) =>
      connection.requestAirdrop(a.keypair.publicKey, 2 * LAMPORTS_PER_SOL)
    ),
  ];

  const sigs = await Promise.all(airdropPromises);
  await Promise.all(sigs.map((s) => connection.confirmTransaction(s)));

  console.log(`  Authority: ${authority.publicKey.toBase58()}`);
  console.log(`  Oracle:    ${oracle.publicKey.toBase58()}`);
  agents.forEach((a) =>
    console.log(`  ${a.name}:  ${a.keypair.publicKey.toBase58()}`)
  );

  // ─── Load Program ──────────────────────────────────────────────

  // Load the IDL
  const idlPath = path.join(__dirname, "..", "target", "idl", "worth_hub.json");
  if (!fs.existsSync(idlPath)) {
    console.error(
      "\n[Error] IDL not found. Please run `anchor build` first."
    );
    console.error(`  Expected: ${idlPath}`);
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const programId = new PublicKey(idl.address || "8qXNZGRTwYeAw3fdPsaqJ3cq5ieyZWtxrXTZizmuZFeQ");

  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);

  const client = new WorthHubClient(program, connection);

  // ─── Phase 1: Create Topic ──────────────────────────────────────

  const now = Math.floor(Date.now() / 1000);
  const commitDeadline = now + COMMIT_WINDOW;
  const revealDeadline = now + REVEAL_WINDOW;

  console.log("\n[Phase 1] Creating prediction topic...");
  console.log(`  Topic ID:        ${TOPIC_ID}`);
  console.log(`  Symbol:          ${SYMBOL}`);
  console.log(`  Commit Deadline: ${new Date(commitDeadline * 1000).toISOString()}`);
  console.log(`  Reveal Deadline: ${new Date(revealDeadline * 1000).toISOString()}`);

  const createTx = await client.createTopic(
    authority,
    oracle.publicKey,
    TOPIC_ID,
    `Predict ${SYMBOL} stock price`,
    SYMBOL,
    commitDeadline,
    revealDeadline,
    10_000_000 // 0.01 SOL min
  );
  console.log(`  Tx: ${createTx}`);

  // ─── Phase 2: Agents Commit ──────────────────────────────────────

  console.log("\n[Phase 2] Agents making predictions and committing...");

  // Simulate LLM predictions (or use real OpenAI if key available)
  const mockPredictions = [150.25, 155.80, 148.50]; // USD

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const prediction = mockPredictions[i];
    const fixedPrediction = toFixedPoint(prediction);
    const salt = generateSalt();

    agent.prediction = fixedPrediction;
    agent.salt = salt;

    const hash = computeCommitmentHash(
      fixedPrediction,
      salt,
      agent.keypair.publicKey
    );

    const tx = await client.commit(
      agent.keypair,
      TOPIC_ID,
      hash,
      STAKE_AMOUNT
    );

    console.log(
      `  ${agent.name} committed: prediction=$${prediction}, stake=0.1 SOL, tx=${tx.slice(0, 20)}...`
    );

    // Small delay between commits to get different submit_order
    await sleep(1000);
  }

  // ─── Phase 3: Wait for Commit Deadline ──────────────────────────

  const waitCommit = commitDeadline - Math.floor(Date.now() / 1000) + 2;
  if (waitCommit > 0) {
    console.log(`\n[Waiting] ${waitCommit}s for commit deadline...`);
    await sleep(waitCommit * 1000);
  }

  // ─── Phase 4: Agents Reveal (only 2 of 3 reveal) ────────────────

  console.log("\n[Phase 3] Agents revealing predictions...");

  // Agent-Alpha and Agent-Beta reveal, Agent-Gamma "forgets" (forfeit)
  for (let i = 0; i < 2; i++) {
    const agent = agents[i];
    const tx = await client.reveal(
      agent.keypair,
      TOPIC_ID,
      agent.prediction,
      agent.salt
    );
    console.log(
      `  ${agent.name} revealed: prediction=$${fromFixedPoint(agent.prediction)}, tx=${tx.slice(0, 20)}...`
    );
  }
  console.log(`  ${agents[2].name} did NOT reveal (will forfeit stake)`);

  // ─── Phase 5: Wait for Reveal Deadline ──────────────────────────

  const waitReveal = revealDeadline - Math.floor(Date.now() / 1000) + 2;
  if (waitReveal > 0) {
    console.log(`\n[Waiting] ${waitReveal}s for reveal deadline...`);
    await sleep(waitReveal * 1000);
  }

  // ─── Phase 6: Oracle Finalizes ──────────────────────────────────

  const truthValue = 151.0; // The "true" price
  const fixedTruth = toFixedPoint(truthValue);

  console.log("\n[Phase 4] Oracle submitting truth value...");
  console.log(`  Truth value: $${truthValue}`);

  const finalizeTx = await client.finalize(oracle, TOPIC_ID, fixedTruth);
  console.log(`  Tx: ${finalizeTx.slice(0, 20)}...`);

  // ─── Phase 7: Settlement ────────────────────────────────────────

  console.log("\n[Phase 5] Settling rewards...");

  // Get balances before
  const balancesBefore = await Promise.all(
    agents.map((a) => connection.getBalance(a.keypair.publicKey))
  );

  // Build commitment-participant pairs
  const [topicPDA] = findTopicPDA(TOPIC_ID);
  const pairs: [PublicKey, PublicKey][] = agents.map((a) => [
    findCommitmentPDA(topicPDA, a.keypair.publicKey)[0],
    a.keypair.publicKey,
  ]);

  const settleTx = await client.settle(authority, TOPIC_ID, pairs);
  console.log(`  Tx: ${settleTx.slice(0, 20)}...`);

  // Get balances after
  const balancesAfter = await Promise.all(
    agents.map((a) => connection.getBalance(a.keypair.publicKey))
  );

  // ─── Results ────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(60));
  console.log("  RESULTS");
  console.log("=".repeat(60));
  console.log();
  console.log(`  Truth value: $${truthValue}`);
  console.log();

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const gain = balancesAfter[i] - balancesBefore[i];
    const gainSOL = gain / LAMPORTS_PER_SOL;
    const prediction = fromFixedPoint(agent.prediction);
    const error = Math.abs(truthValue - prediction);
    const revealed = i < 2;

    console.log(`  ${agent.name}:`);
    console.log(`    Prediction: $${prediction.toFixed(2)}`);
    console.log(`    Error:      $${error.toFixed(2)}`);
    console.log(`    Revealed:   ${revealed ? "Yes" : "No (forfeited)"}`);
    console.log(
      `    PnL:        ${gainSOL >= 0 ? "+" : ""}${gainSOL.toFixed(6)} SOL`
    );
    console.log();
  }

  // Agent-Alpha predicted $150.25, truth is $151.00, error = $0.75 (closest!)
  // Agent-Beta predicted $155.80, truth is $151.00, error = $4.80
  // Agent-Gamma didn't reveal, forfeited 0.1 SOL

  console.log("Demo complete!");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
