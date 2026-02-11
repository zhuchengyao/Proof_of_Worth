import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import { keccak_256 } from "js-sha3";

// We'll reference the IDL type once generated; for now use `any`
type WorthHub = any;

/**
 * Helper: compute commitment hash matching the on-chain logic
 * keccak256(prediction_value_le_bytes || salt || participant_pubkey)
 */
function computeHash(
  predictionValue: number,
  salt: Buffer,
  participant: PublicKey
): number[] {
  const buf = Buffer.alloc(8 + 32 + 32);
  buf.writeBigInt64LE(BigInt(predictionValue), 0);
  salt.copy(buf, 8);
  participant.toBuffer().copy(buf, 40);
  const hash = keccak_256.arrayBuffer(buf);
  return Array.from(new Uint8Array(hash));
}

function randomSalt(): Buffer {
  return Buffer.from(Keypair.generate().secretKey.slice(0, 32));
}

describe("WorthHub", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.WorthHub as Program<WorthHub>;

  // Keys
  const authority = Keypair.generate();
  const oracleAuthority = Keypair.generate();
  const agent1 = Keypair.generate();
  const agent2 = Keypair.generate();
  const agent3 = Keypair.generate();

  // Topic parameters
  const topicId = 1;
  let topicPDA: PublicKey;
  let topicBump: number;
  let vaultPDA: PublicKey;
  let vaultBump: number;

  // Airdrop helper
  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  }

  before(async () => {
    // Derive PDAs
    const topicIdBuf = Buffer.alloc(8);
    topicIdBuf.writeBigUInt64LE(BigInt(topicId));
    [topicPDA, topicBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("topic"), topicIdBuf],
      program.programId
    );
    [vaultPDA, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), topicPDA.toBuffer()],
      program.programId
    );

    // Fund all accounts
    await Promise.all([
      airdrop(authority.publicKey, 10),
      airdrop(oracleAuthority.publicKey, 5),
      airdrop(agent1.publicKey, 5),
      airdrop(agent2.publicKey, 5),
      airdrop(agent3.publicKey, 5),
    ]);
  });

  // ─── Test 1: Create Topic ────────────────────────────────────────

  describe("create_topic", () => {
    it("should create a topic successfully", async () => {
      const now = Math.floor(Date.now() / 1000);
      const commitDeadline = now + 60; // 60 seconds from now
      const revealDeadline = now + 120; // 120 seconds from now
      const minStake = 10_000_000; // 0.01 SOL

      await program.methods
        .createTopic(
          new BN(topicId),
          "Predict AAPL stock price in 24h",
          "AAPL",
          new BN(commitDeadline),
          new BN(revealDeadline),
          new BN(minStake)
        )
        .accounts({
          authority: authority.publicKey,
          oracleAuthority: oracleAuthority.publicKey,
          topic: topicPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.topicId.toNumber()).to.equal(topicId);
      expect(topic.description).to.equal("Predict AAPL stock price in 24h");
      expect(topic.symbol).to.equal("AAPL");
      expect(topic.status).to.have.property("open");
      expect(topic.commitmentCount).to.equal(0);
      expect(topic.totalStake.toNumber()).to.equal(0);
    });

    it("should fail with description too long", async () => {
      const topicId2 = 999;
      const topicIdBuf = Buffer.alloc(8);
      topicIdBuf.writeBigUInt64LE(BigInt(topicId2));
      const [topicPDA2] = PublicKey.findProgramAddressSync(
        [Buffer.from("topic"), topicIdBuf],
        program.programId
      );
      const [vaultPDA2] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), topicPDA2.toBuffer()],
        program.programId
      );

      const now = Math.floor(Date.now() / 1000);
      const longDesc = "x".repeat(300);

      try {
        await program.methods
          .createTopic(
            new BN(topicId2),
            longDesc,
            "TEST",
            new BN(now + 60),
            new BN(now + 120),
            new BN(10_000_000)
          )
          .accounts({
            authority: authority.publicKey,
            oracleAuthority: oracleAuthority.publicKey,
            topic: topicPDA2,
            vault: vaultPDA2,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("DescriptionTooLong");
      }
    });
  });

  // ─── Test 2: Commit Phase ────────────────────────────────────────

  describe("commit", () => {
    // Agent predictions (fixed-point: price * 1e6)
    const prediction1 = 150_000_000; // $150.00
    const prediction2 = 155_500_000; // $155.50
    const prediction3 = 148_000_000; // $148.00

    const salt1 = randomSalt();
    const salt2 = randomSalt();
    const salt3 = randomSalt();

    const stakeAmount = 100_000_000; // 0.1 SOL

    it("agent1 should commit successfully", async () => {
      const hash = computeHash(prediction1, salt1, agent1.publicKey);
      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent1.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .commit(hash, new BN(stakeAmount))
        .accounts({
          participant: agent1.publicKey,
          topic: topicPDA,
          commitment: commitPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent1])
        .rpc();

      const commitment = await program.account.commitment.fetch(commitPDA);
      expect(commitment.participant.toBase58()).to.equal(agent1.publicKey.toBase58());
      expect(commitment.stakeAmount.toNumber()).to.equal(stakeAmount);
      expect(commitment.submitOrder).to.equal(0);
      expect(commitment.revealed).to.be.false;

      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.commitmentCount).to.equal(1);
      expect(topic.totalStake.toNumber()).to.equal(stakeAmount);
    });

    it("agent2 should commit successfully", async () => {
      const hash = computeHash(prediction2, salt2, agent2.publicKey);
      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent2.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .commit(hash, new BN(stakeAmount))
        .accounts({
          participant: agent2.publicKey,
          topic: topicPDA,
          commitment: commitPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent2])
        .rpc();

      const commitment = await program.account.commitment.fetch(commitPDA);
      expect(commitment.submitOrder).to.equal(1);

      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.commitmentCount).to.equal(2);
    });

    it("agent3 should commit successfully", async () => {
      const hash = computeHash(prediction3, salt3, agent3.publicKey);
      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent3.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .commit(hash, new BN(stakeAmount))
        .accounts({
          participant: agent3.publicKey,
          topic: topicPDA,
          commitment: commitPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent3])
        .rpc();

      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.commitmentCount).to.equal(3);
      expect(topic.totalStake.toNumber()).to.equal(stakeAmount * 3);
    });

    it("should fail with zero stake", async () => {
      const tmpAgent = Keypair.generate();
      await airdrop(tmpAgent.publicKey, 1);

      const hash = computeHash(100_000_000, randomSalt(), tmpAgent.publicKey);
      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), tmpAgent.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .commit(hash, new BN(0))
          .accounts({
            participant: tmpAgent.publicKey,
            topic: topicPDA,
            commitment: commitPDA,
            vault: vaultPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([tmpAgent])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("ZeroStake");
      }
    });

    // Store predictions and salts for later reveal tests
    // (These are module-level so reveal tests can access them)
    (global as any).__test_predictions = { prediction1, prediction2, prediction3 };
    (global as any).__test_salts = { salt1, salt2, salt3 };
  });

  // ─── Test 3: Reveal Phase ────────────────────────────────────────

  describe("reveal", () => {
    // We need to warp time past the commit deadline
    // In localnet tests, we manipulate the clock via Bankrun or wait

    it("should fail to reveal before commit deadline", async () => {
      const { prediction1 } = (global as any).__test_predictions;
      const { salt1 } = (global as any).__test_salts;

      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent1.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .reveal(new BN(prediction1), Array.from(salt1))
          .accounts({
            participant: agent1.publicKey,
            topic: topicPDA,
            commitment: commitPDA,
          })
          .signers([agent1])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("CommitPhaseNotEnded");
      }
    });

    it("agent1 and agent2 should reveal successfully (after commit deadline)", async function () {
      this.timeout(70000);

      // Wait for commit deadline to pass
      const topic = await program.account.topic.fetch(topicPDA);
      const now = Math.floor(Date.now() / 1000);
      const waitTime = topic.commitDeadline.toNumber() - now + 2;

      if (waitTime > 0) {
        console.log(`    Waiting ${waitTime}s for commit deadline...`);
        await new Promise((r) => setTimeout(r, waitTime * 1000));
      }

      const { prediction1, prediction2 } = (global as any).__test_predictions;
      const { salt1, salt2 } = (global as any).__test_salts;

      // Agent 1 reveals
      const [commitPDA1] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent1.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .reveal(new BN(prediction1), Array.from(salt1))
        .accounts({
          participant: agent1.publicKey,
          topic: topicPDA,
          commitment: commitPDA1,
        })
        .signers([agent1])
        .rpc();

      let commitment1 = await program.account.commitment.fetch(commitPDA1);
      expect(commitment1.revealed).to.be.true;
      expect(commitment1.predictionValue.toNumber()).to.equal(prediction1);

      // Agent 2 reveals
      const [commitPDA2] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent2.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .reveal(new BN(prediction2), Array.from(salt2))
        .accounts({
          participant: agent2.publicKey,
          topic: topicPDA,
          commitment: commitPDA2,
        })
        .signers([agent2])
        .rpc();

      let commitment2 = await program.account.commitment.fetch(commitPDA2);
      expect(commitment2.revealed).to.be.true;

      // Agent 3 does NOT reveal (will forfeit stake)
      const topicData = await program.account.topic.fetch(topicPDA);
      expect(topicData.revealCount).to.equal(2);
      expect(topicData.status).to.have.property("revealing");
    });

    it("should fail with wrong salt (hash mismatch)", async () => {
      // Agent 3 tries to reveal with wrong salt
      const { prediction3 } = (global as any).__test_predictions;
      const wrongSalt = randomSalt();

      const [commitPDA3] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent3.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .reveal(new BN(prediction3), Array.from(wrongSalt))
          .accounts({
            participant: agent3.publicKey,
            topic: topicPDA,
            commitment: commitPDA3,
          })
          .signers([agent3])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("HashMismatch");
      }
    });
  });

  // ─── Test 4: Finalize Phase ──────────────────────────────────────

  describe("finalize", () => {
    it("should fail when called by non-oracle", async function () {
      this.timeout(70000);

      // Wait for reveal deadline to pass
      const topic = await program.account.topic.fetch(topicPDA);
      const now = Math.floor(Date.now() / 1000);
      const waitTime = topic.revealDeadline.toNumber() - now + 2;

      if (waitTime > 0) {
        console.log(`    Waiting ${waitTime}s for reveal deadline...`);
        await new Promise((r) => setTimeout(r, waitTime * 1000));
      }

      const truthValue = 151_000_000; // $151.00

      try {
        await program.methods
          .finalize(new BN(truthValue))
          .accounts({
            oracleAuthority: agent1.publicKey, // wrong authority
            topic: topicPDA,
          })
          .signers([agent1])
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("UnauthorizedOracle");
      }
    });

    it("oracle should finalize successfully", async () => {
      const truthValue = 151_000_000; // $151.00

      await program.methods
        .finalize(new BN(truthValue))
        .accounts({
          oracleAuthority: oracleAuthority.publicKey,
          topic: topicPDA,
        })
        .signers([oracleAuthority])
        .rpc();

      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.truthValue.toNumber()).to.equal(truthValue);
      expect(topic.status).to.have.property("finalized");
    });
  });

  // ─── Test 5: Settlement ──────────────────────────────────────────

  describe("settle", () => {
    it("should settle and distribute rewards correctly", async () => {
      // Get balances before settlement
      const bal1Before = await provider.connection.getBalance(agent1.publicKey);
      const bal2Before = await provider.connection.getBalance(agent2.publicKey);
      const bal3Before = await provider.connection.getBalance(agent3.publicKey);

      // Build remaining accounts
      const [commitPDA1] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent1.publicKey.toBuffer()],
        program.programId
      );
      const [commitPDA2] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent2.publicKey.toBuffer()],
        program.programId
      );
      const [commitPDA3] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), topicPDA.toBuffer(), agent3.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .settle()
        .accounts({
          authority: authority.publicKey,
          topic: topicPDA,
          vault: vaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: commitPDA1, isSigner: false, isWritable: true },
          { pubkey: agent1.publicKey, isSigner: false, isWritable: true },
          { pubkey: commitPDA2, isSigner: false, isWritable: true },
          { pubkey: agent2.publicKey, isSigner: false, isWritable: true },
          { pubkey: commitPDA3, isSigner: false, isWritable: true },
          { pubkey: agent3.publicKey, isSigner: false, isWritable: true },
        ])
        .signers([authority])
        .rpc();

      // Get balances after
      const bal1After = await provider.connection.getBalance(agent1.publicKey);
      const bal2After = await provider.connection.getBalance(agent2.publicKey);
      const bal3After = await provider.connection.getBalance(agent3.publicKey);

      const gain1 = bal1After - bal1Before;
      const gain2 = bal2After - bal2Before;
      const gain3 = bal3After - bal3Before;

      console.log(`    Agent1 (pred $150.00, truth $151.00): gain = ${gain1 / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Agent2 (pred $155.50, truth $151.00): gain = ${gain2 / LAMPORTS_PER_SOL} SOL`);
      console.log(`    Agent3 (no reveal, forfeited):        gain = ${gain3 / LAMPORTS_PER_SOL} SOL`);

      // Consensus-Deviation-Weighted Reward Formula:
      //   consensus = ($150 × 0.1 + $155.50 × 0.1) / 0.2 = $152.75
      //   truth_edge = $151 - $152.75 = -$1.75 (truth is BELOW consensus)
      //
      //   Agent1: edge = $150 - $152.75 = -$2.75 (predicted below consensus → SAME direction as truth)
      //           alignment > 0 → gets bonus from loser pool
      //   Agent2: edge = $155.50 - $152.75 = +$2.75 (predicted above consensus → WRONG direction)
      //           alignment < 0 → score = 0, only gets stake back
      //   Agent3: didn't reveal → forfeits stake entirely

      // Agent1 should get more than Agent2 (Agent1 has positive alignment, Agent2 has zero)
      expect(gain1).to.be.greaterThan(gain2);

      // Agent3 should get nothing (forfeited)
      expect(gain3).to.equal(0);

      // Both revealed agents should at least get their stake back
      expect(gain1).to.be.greaterThan(0);
      expect(gain2).to.be.greaterThan(0);

      // Check topic is settled
      const topic = await program.account.topic.fetch(topicPDA);
      expect(topic.status).to.have.property("settled");
    });
  });

  // ─── Test 6: Edge Cases ──────────────────────────────────────────

  describe("edge cases", () => {
    it("should handle single participant topic", async () => {
      const singleTopicId = 2;
      const singleIdBuf = Buffer.alloc(8);
      singleIdBuf.writeBigUInt64LE(BigInt(singleTopicId));
      const [singleTopicPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("topic"), singleIdBuf],
        program.programId
      );
      const [singleVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), singleTopicPDA.toBuffer()],
        program.programId
      );

      const now = Math.floor(Date.now() / 1000);

      // Create topic with very short deadlines for testing
      await program.methods
        .createTopic(
          new BN(singleTopicId),
          "Single participant test",
          "TEST",
          new BN(now + 5), // 5 seconds
          new BN(now + 10), // 10 seconds
          new BN(10_000_000)
        )
        .accounts({
          authority: authority.publicKey,
          oracleAuthority: oracleAuthority.publicKey,
          topic: singleTopicPDA,
          vault: singleVaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Only agent1 commits
      const prediction = 100_000_000;
      const salt = randomSalt();
      const hash = computeHash(prediction, salt, agent1.publicKey);
      const [commitPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("commitment"), singleTopicPDA.toBuffer(), agent1.publicKey.toBuffer()],
        program.programId
      );
      const stakeAmount = 50_000_000;

      await program.methods
        .commit(hash, new BN(stakeAmount))
        .accounts({
          participant: agent1.publicKey,
          topic: singleTopicPDA,
          commitment: commitPDA,
          vault: singleVaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([agent1])
        .rpc();

      // Wait for commit deadline
      await new Promise((r) => setTimeout(r, 6000));

      // Reveal
      await program.methods
        .reveal(new BN(prediction), Array.from(salt))
        .accounts({
          participant: agent1.publicKey,
          topic: singleTopicPDA,
          commitment: commitPDA,
        })
        .signers([agent1])
        .rpc();

      // Wait for reveal deadline
      await new Promise((r) => setTimeout(r, 6000));

      // Finalize
      await program.methods
        .finalize(new BN(100_000_000))
        .accounts({
          oracleAuthority: oracleAuthority.publicKey,
          topic: singleTopicPDA,
        })
        .signers([oracleAuthority])
        .rpc();

      const balBefore = await provider.connection.getBalance(agent1.publicKey);

      // Settle
      await program.methods
        .settle()
        .accounts({
          authority: authority.publicKey,
          topic: singleTopicPDA,
          vault: singleVaultPDA,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: commitPDA, isSigner: false, isWritable: true },
          { pubkey: agent1.publicKey, isSigner: false, isWritable: true },
        ])
        .signers([authority])
        .rpc();

      const balAfter = await provider.connection.getBalance(agent1.publicKey);
      const gain = balAfter - balBefore;

      // Single participant should get back their stake minus vault rent-exempt minimum
      // The vault retains ~890,880 lamports for rent exemption
      const rentExempt = 890_880;
      expect(gain).to.be.closeTo(stakeAmount - rentExempt, 10_000); // allow small rounding
      console.log(`    Single participant gets back: ${gain / LAMPORTS_PER_SOL} SOL (rent reserved: ${rentExempt / LAMPORTS_PER_SOL} SOL)`);
    });
  });
});
