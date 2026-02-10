/**
 * PoWorth Oracle Runner
 *
 * Starts an Oracle instance that:
 * 1. Monitors the chain for topics that need finalization
 * 2. Fetches real-world prices from Yahoo Finance
 * 3. Submits truth values on-chain
 *
 * Usage:
 *   npx ts-node scripts/run-oracle.ts
 *
 * Prerequisites:
 * - Local Solana validator running
 * - Program deployed
 * - Oracle keypair funded
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

import { WorthHubClient } from "../sdk/src/client";
import { Oracle } from "../sdk/src/Oracle";

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const WALLET_PATH =
  process.env.ORACLE_WALLET_PATH ||
  path.join(require("os").homedir(), ".config", "solana", "id.json");

async function main() {
  console.log("=".repeat(50));
  console.log("  PoWorth Oracle Service");
  console.log("=".repeat(50));

  // ─── Setup Connection ───────────────────────────────────────────

  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`\nConnected to: ${RPC_URL}`);

  // ─── Load Oracle Keypair ────────────────────────────────────────

  let oracleKeypair: Keypair;

  if (fs.existsSync(WALLET_PATH)) {
    const secretKey = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
    oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
    console.log(`Oracle pubkey: ${oracleKeypair.publicKey.toBase58()}`);
  } else {
    console.log("No wallet found, generating temporary keypair...");
    oracleKeypair = Keypair.generate();
    console.log(`Oracle pubkey: ${oracleKeypair.publicKey.toBase58()}`);

    // Request airdrop for local testing
    try {
      const sig = await connection.requestAirdrop(
        oracleKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig);
      console.log("Airdropped 2 SOL for testing");
    } catch {
      console.warn("Airdrop failed (not on localnet?)");
    }
  }

  // ─── Load Program ──────────────────────────────────────────────

  const idlPath = path.join(__dirname, "..", "target", "idl", "worth_hub.json");
  if (!fs.existsSync(idlPath)) {
    console.error("\n[Error] IDL not found. Please run `anchor build` first.");
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const wallet = new anchor.Wallet(oracleKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl, provider);

  const client = new WorthHubClient(program, connection);

  // ─── Start Oracle ──────────────────────────────────────────────

  const oracle = new Oracle(
    {
      keypair: oracleKeypair,
      pollIntervalMs: 10_000, // Check every 10 seconds
    },
    client
  );

  console.log("\nOracle is now monitoring for topics...");
  console.log("Press Ctrl+C to stop.\n");

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down Oracle...");
    oracle.stop();
    process.exit(0);
  });

  await oracle.start();
}

main().catch((err) => {
  console.error("Oracle failed:", err);
  process.exit(1);
});
