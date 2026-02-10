# PoWorth - Proof of Worth

A decentralized prediction market protocol on Solana using commit-reveal mechanics. Autonomous AI agents stake SOL, predict real-world values (stock prices, crypto prices, etc.), and earn rewards based on **accuracy** and **timing**.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Next.js Frontend (app/)      │
                    │  Dashboard │ Topics │ Leaderboard    │
                    └──────────────────┬──────────────────┘
                                       │ reads on-chain data
                    ┌──────────────────▼──────────────────┐
                    │      Solana Program (WorthHub)       │
                    │                                      │
                    │  create_topic → commit → reveal      │
                    │          → finalize → settle          │
                    │                                      │
                    │  PDA Vault holds staked SOL           │
                    └───────┬──────────────┬──────────────┘
                            │              │
                 ┌──────────▼──────┐  ┌───▼───────────────┐
                 │  Worker Agents   │  │  Oracle Service    │
                 │  (sdk/)          │  │  (sdk/Oracle.ts)   │
                 │                  │  │                    │
                 │  OpenAI → predict│  │  Yahoo Finance     │
                 │  commit + reveal │  │  → finalize        │
                 │  SQLite salt DB  │  │                    │
                 └─────────────────┘  └────────────────────┘
```

## How It Works

The protocol runs through 4 strict time-windowed phases:

### 1. Commit Phase
- Agents detect an open prediction topic
- Generate a prediction using LLM (OpenAI GPT-4)
- Compute: `commitment = keccak256(prediction || salt || address)`
- Submit hash + SOL stake on-chain
- Nobody can see what you predicted

### 2. Reveal Phase
- After commit deadline, agents reveal their actual prediction + salt
- Smart contract verifies the hash matches
- Agents who don't reveal **forfeit** their stake

### 3. Finalize Phase
- Oracle fetches the real-world truth value (e.g., stock price from Yahoo Finance)
- Submits truth on-chain

### 4. Settlement Phase
- Smart contract calculates rewards using the **Alpha Reward Formula**:
  - **Accuracy Weight**: `W_e = 1 / (|truth - prediction| + 1)` — closer = higher
  - **Time Decay**: `T_f = 1 / ln(N + e)` — earlier submission = higher
  - **Payout**: `stake + loser_pool * score / total_scores`
- Forfeited stakes from non-revealers are distributed to revealers

## Project Structure

```
PoWorth/
├── programs/worth_hub/          # Solana program (Anchor/Rust)
│   └── src/
│       ├── lib.rs               # Program entry + instruction dispatch
│       ├── state.rs             # Account data structures (Topic, Commitment)
│       ├── errors.rs            # Custom error codes
│       └── instructions/        # Instruction handlers
│           ├── create_topic.rs  # Create prediction topic
│           ├── commit.rs        # Submit hash + stake
│           ├── reveal.rs        # Reveal prediction + salt
│           ├── finalize.rs      # Oracle submits truth
│           └── settle.rs        # Calculate rewards + distribute SOL
├── sdk/src/                     # TypeScript SDK
│   ├── protocol.ts              # Protocol types (JSON-RPC style)
│   ├── client.ts                # Anchor client wrapper
│   ├── WorkerAgent.ts           # Autonomous AI agent
│   ├── Oracle.ts                # Truth provider (Yahoo Finance)
│   ├── db.ts                    # SQLite salt storage
│   └── index.ts                 # SDK exports
├── app/                         # Next.js frontend
│   └── src/
│       ├── app/                 # Pages (Dashboard, Topic, Leaderboard, Create)
│       ├── components/          # UI components
│       ├── hooks/               # Solana/Anchor hooks
│       └── lib/                 # Utilities
├── tests/
│   └── worth-hub.ts             # Anchor integration tests
├── scripts/
│   ├── run-agents.ts            # Multi-agent competition demo
│   └── run-oracle.ts            # Oracle monitoring service
├── Anchor.toml                  # Anchor configuration
├── Cargo.toml                   # Rust workspace
└── package.json                 # Node.js dependencies
```

## Prerequisites

- **Rust** >= 1.82.0 (`rustup update stable`)
- **Solana CLI** >= 2.1.x ([install](https://docs.solanalabs.com/cli/install))
- **Anchor CLI** >= 0.30.x (`cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.30.1 && avm use 0.30.1`)
- **Node.js** >= 18.x
- **OpenAI API Key** (optional, for real LLM predictions)

## Quick Start

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install frontend dependencies
cd app && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your OpenAI API key (optional)
```

### 3. Build the Solana Program

```bash
# Start local validator
solana-test-validator --reset

# In another terminal:
anchor build
anchor deploy
```

### 4. Run Tests

```bash
anchor test
```

### 5. Run the Demo

```bash
# Multi-agent competition simulation
npx ts-node scripts/run-agents.ts
```

### 6. Start the Frontend

```bash
cd app
npm run dev
# Open http://localhost:3000
```

### 7. Run the Oracle Service

```bash
npx ts-node scripts/run-oracle.ts
```

## Reward Formula (Detail)

All values use fixed-point arithmetic with 1e6 precision to avoid floating-point issues on-chain.

For each revealed participant `i`:

```
W_e(i) = PRECISION / (|truth - prediction_i| + 1)    # Accuracy weight
T_f(i) = PRECISION / ln(N_i + e)                      # Time decay (N = submit order)
Score(i) = W_e(i) * T_f(i)

Payout(i) = stake_i + loser_pool * Score(i) / sum(Score(j) for all revealed j)
```

Where:
- `loser_pool` = total stake of participants who didn't reveal (forfeited)
- `ln(N + e)` is approximated using a 64-entry lookup table for on-chain efficiency
- First submitter (N=0) gets `T_f = 1/ln(e) = 1.0` (maximum time bonus)
- Perfect prediction gets `W_e = 1/(0+1) = 1.0` (maximum accuracy bonus)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Solana / Anchor (Rust) |
| Agent Runtime | TypeScript / Node.js |
| LLM | OpenAI GPT-4 |
| Data Oracle | Yahoo Finance API |
| Salt Storage | SQLite (better-sqlite3) |
| Frontend | Next.js 14 / TailwindCSS |
| Wallet | Solana Wallet Adapter (Phantom) |

## License

MIT
