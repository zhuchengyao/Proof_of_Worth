use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WorthHubError;
use crate::state::{Commitment, Topic, TopicStatus};

/// Fixed-point precision: 1e6
const PRECISION: u128 = 1_000_000;

/// Maximum percentage deviation (100x = 10000%) to prevent overflow
const MAX_PCT: i128 = 100_000_000; // PRECISION * 100

/// Precomputed ln(N + e) * PRECISION values for N = 0..63
/// ln(0 + e) = 1.0, ln(1 + e) ≈ 1.313, ln(2 + e) ≈ 1.547, ...
/// These are scaled by PRECISION (1e6)
const LN_TABLE: [u128; 64] = [
    1_000_000,  // ln(e) = 1.0
    1_313_262,  // ln(1 + e)
    1_547_563,  // ln(2 + e)
    1_734_601,  // ln(3 + e)
    1_890_066,  // ln(4 + e)
    2_022_971,  // ln(5 + e)
    2_138_990,  // ln(6 + e)
    2_241_671,  // ln(7 + e)
    2_333_586,  // ln(8 + e)
    2_416_540,  // ln(9 + e)
    2_491_930,  // ln(10 + e)
    2_560_867,  // ln(11 + e)
    2_624_230,  // ln(12 + e)
    2_682_718,  // ln(13 + e)
    2_736_892,  // ln(14 + e)
    2_787_200,  // ln(15 + e)
    2_834_006,  // ln(16 + e)
    2_877_612,  // ln(17 + e)
    2_918_272,  // ln(18 + e)
    2_956_202,  // ln(19 + e)
    2_991_583,  // ln(20 + e)
    3_024_572,  // ln(21 + e)
    3_055_305,  // ln(22 + e)
    3_083_901,  // ln(23 + e)
    3_110_467,  // ln(24 + e)
    3_135_098,  // ln(25 + e)
    3_157_880,  // ln(26 + e)
    3_178_889,  // ln(27 + e)
    3_198_196,  // ln(28 + e)
    3_215_862,  // ln(29 + e)
    3_231_943,  // ln(30 + e)
    3_246_491,  // ln(31 + e)
    3_259_550,  // ln(32 + e)
    3_271_162,  // ln(33 + e)
    3_281_365,  // ln(34 + e)
    3_290_193,  // ln(35 + e)
    3_297_677,  // ln(36 + e)
    3_303_847,  // ln(37 + e)
    3_308_728,  // ln(38 + e)
    3_312_345,  // ln(39 + e)
    3_314_718,  // ln(40 + e)
    3_315_869,  // ln(41 + e)
    3_315_816,  // ln(42 + e)
    3_314_576,  // ln(43 + e)
    3_312_165,  // ln(44 + e)
    3_308_598,  // ln(45 + e)
    3_303_889,  // ln(46 + e)
    3_298_050,  // ln(47 + e)
    3_291_094,  // ln(48 + e)
    3_283_031,  // ln(49 + e)
    3_273_873,  // ln(50 + e)
    3_263_628,  // ln(51 + e)
    3_252_306,  // ln(52 + e)
    3_239_916,  // ln(53 + e)
    3_226_465,  // ln(54 + e)
    3_211_962,  // ln(55 + e)
    3_196_413,  // ln(56 + e)
    3_179_826,  // ln(57 + e)
    3_162_207,  // ln(58 + e)
    3_143_562,  // ln(59 + e)
    3_123_897,  // ln(60 + e)
    3_103_218,  // ln(61 + e)
    3_081_530,  // ln(62 + e)
    3_058_839,  // ln(63 + e)
];

/// Get ln(N + e) * PRECISION, with fallback approximation for N >= 64
fn ln_approx(n: u32) -> u128 {
    if (n as usize) < LN_TABLE.len() {
        LN_TABLE[n as usize]
    } else {
        // For N >= 64, use approximation: ln(N + e) ≈ ln(N) ≈ ln(64) + (N-64)/64
        // ln(64) * 1e6 ≈ 4_158_883
        let base: u128 = 4_158_883;
        let extra = ((n as u128) - 64) * PRECISION / 64;
        base + extra / 10 // dampen the growth
    }
}

#[derive(Accounts)]
pub struct SettleTopic<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = topic.status == TopicStatus::Finalized @ WorthHubError::InvalidTopicState,
        constraint = (topic.authority == authority.key() || topic.oracle_authority == authority.key())
            @ WorthHubError::UnauthorizedAuthority,
    )]
    pub topic: Account<'info, Topic>,

    /// The vault PDA holding staked SOL
    /// CHECK: Validated by seeds
    #[account(
        mut,
        seeds = [b"vault", topic.key().as_ref()],
        bump = topic.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,

    // Remaining accounts: pairs of (commitment_account, participant_account)
    // passed via ctx.remaining_accounts
}

/// Consensus-Deviation-Weighted Reward Formula
///
/// Instead of rewarding pure accuracy, this formula rewards predictions that
/// deviate from the consensus in the correct direction. Bold, contrarian
/// predictions that turn out to be right earn significantly more.
///
/// Algorithm:
///   1. Compute stake-weighted consensus: μ = Σ(pred_i × stake_i) / Σ(stake_i)
///   2. For each participant:
///      - edge_pct  = (pred_i − μ) × PRECISION / |μ|    (% deviation from consensus)
///      - truth_pct = (truth − μ) × PRECISION / |μ|     (% truth deviation from consensus)
///      - alignment = edge_pct × truth_pct               (positive ⟹ correct direction)
///   3. Score = max(0, alignment) × accuracy × time_decay
///      where accuracy  = PRECISION² / (|truth − pred| + 1)
///            time_decay = PRECISION² / ln(N + e)
///   4. Payout = stake + loser_pool × score / Σ(scores)
///
/// Key properties:
///   - Consensus predictors (edge ≈ 0) get near-zero bonus
///   - Wrong-direction predictions (alignment < 0) get zero bonus
///   - Bold + accurate predictions get the largest share
pub fn handle_settle<'info>(ctx: Context<'_, '_, 'info, 'info, SettleTopic<'info>>) -> Result<()> {
    let topic = &ctx.accounts.topic;
    let truth = topic.truth_value;
    let topic_key = topic.key();

    // Parse remaining accounts as commitment + participant pairs
    let remaining = &ctx.remaining_accounts;
    require!(remaining.len() % 2 == 0, WorthHubError::NoRevealedCommitments);
    require!(!remaining.is_empty(), WorthHubError::NoRevealedCommitments);

    let pair_count = remaining.len() / 2;

    // ── Phase 1: Deserialize all commitments and compute consensus ──────

    struct ParticipantData {
        commitment_index: usize,
        participant_index: usize,
        stake: u64,
        prediction: i64,
        submit_order: u32,
        revealed: bool,
    }

    let mut participants: Vec<ParticipantData> = Vec::with_capacity(pair_count);
    let mut consensus_num: i128 = 0; // Σ(prediction × stake)
    let mut total_revealed_stake: u64 = 0;
    let mut total_unrevealed_stake: u64 = 0;

    for i in 0..pair_count {
        let commitment_info = &remaining[i * 2];
        let data = commitment_info.try_borrow_data()?;

        let commitment: Commitment =
            Commitment::try_deserialize(&mut &data[..])
                .map_err(|_| WorthHubError::NoRevealedCommitments)?;

        if commitment.revealed {
            consensus_num = consensus_num
                .checked_add(
                    (commitment.prediction_value as i128)
                        .checked_mul(commitment.stake_amount as i128)
                        .ok_or(WorthHubError::ArithmeticOverflow)?,
                )
                .ok_or(WorthHubError::ArithmeticOverflow)?;
            total_revealed_stake = total_revealed_stake
                .checked_add(commitment.stake_amount)
                .ok_or(WorthHubError::ArithmeticOverflow)?;
        } else {
            total_unrevealed_stake = total_unrevealed_stake
                .checked_add(commitment.stake_amount)
                .ok_or(WorthHubError::ArithmeticOverflow)?;
        }

        participants.push(ParticipantData {
            commitment_index: i * 2,
            participant_index: i * 2 + 1,
            stake: commitment.stake_amount,
            prediction: commitment.prediction_value,
            submit_order: commitment.submit_order,
            revealed: commitment.revealed,
        });
    }

    // Stake-weighted consensus of revealed predictions
    let consensus: i128 = if total_revealed_stake > 0 {
        consensus_num / (total_revealed_stake as i128)
    } else {
        0
    };

    // ── Phase 2: Compute consensus-deviation-weighted scores ────────────

    let truth_i128 = truth as i128;
    let truth_edge: i128 = truth_i128 - consensus;

    // Use |consensus| for percentage normalization (min 1 to avoid division by zero)
    let abs_consensus: i128 = consensus.unsigned_abs().max(1) as i128;

    // truth_edge as percentage of consensus (capped to prevent overflow)
    let truth_edge_pct: i128 = (truth_edge
        .checked_mul(PRECISION as i128)
        .ok_or(WorthHubError::ArithmeticOverflow)?
        / abs_consensus)
        .max(-MAX_PCT)
        .min(MAX_PCT);

    struct ScoredParticipant {
        commitment_index: usize,
        participant_index: usize,
        stake: u64,
        score: u128,
        revealed: bool,
    }

    let mut scored: Vec<ScoredParticipant> = Vec::with_capacity(pair_count);
    let mut total_score: u128 = 0;

    for p in &participants {
        if p.revealed {
            // Percentage deviation from consensus (capped)
            let edge_i: i128 = (p.prediction as i128) - consensus;
            let edge_pct: i128 = (edge_i
                .checked_mul(PRECISION as i128)
                .ok_or(WorthHubError::ArithmeticOverflow)?
                / abs_consensus)
                .max(-MAX_PCT)
                .min(MAX_PCT);

            // Alignment = edge_pct × truth_edge_pct
            // Positive when prediction deviates from consensus in the SAME direction as truth
            let alignment_i: i128 = edge_pct
                .checked_mul(truth_edge_pct)
                .ok_or(WorthHubError::ArithmeticOverflow)?;

            let score: u128 = if alignment_i > 0 {
                let alignment: u128 = alignment_i as u128;

                // Accuracy weight: PRECISION² / (|truth − prediction| + 1)
                let error = (truth_i128 - p.prediction as i128).unsigned_abs();
                let w_e: u128 = PRECISION * PRECISION / (error + 1);

                // Time decay: PRECISION² / ln(N + e)
                let ln_val = ln_approx(p.submit_order);
                let t_f: u128 = PRECISION * PRECISION / ln_val;

                // score = alignment × w_e / PRECISION × t_f / PRECISION
                let step1 = alignment
                    .checked_mul(w_e)
                    .ok_or(WorthHubError::ArithmeticOverflow)?
                    / PRECISION;
                step1
                    .checked_mul(t_f)
                    .ok_or(WorthHubError::ArithmeticOverflow)?
                    / PRECISION
            } else {
                // Wrong direction or exactly on consensus → no bonus
                0
            };

            total_score = total_score
                .checked_add(score)
                .ok_or(WorthHubError::ArithmeticOverflow)?;

            scored.push(ScoredParticipant {
                commitment_index: p.commitment_index,
                participant_index: p.participant_index,
                stake: p.stake,
                score,
                revealed: true,
            });
        } else {
            scored.push(ScoredParticipant {
                commitment_index: p.commitment_index,
                participant_index: p.participant_index,
                stake: p.stake,
                score: 0,
                revealed: false,
            });
        }
    }

    // ── Phase 3: Distribute rewards ─────────────────────────────────────

    // The "loser pool" is the unrevealed stakes (people who didn't reveal forfeit)
    let loser_pool = total_unrevealed_stake as u128;

    // We need to keep the vault rent-exempt. A 0-data account needs ~890_880 lamports.
    // Reserve this from the pool.
    let rent = Rent::get()?;
    let rent_exempt_min = rent.minimum_balance(0);

    // Calculate all payouts first
    let mut payouts: Vec<u64> = Vec::with_capacity(scored.len());
    let mut total_payout: u64 = 0;

    for sp in &scored {
        let payout: u64 = if sp.revealed && total_score > 0 {
            let bonus = loser_pool
                .checked_mul(sp.score)
                .ok_or(WorthHubError::ArithmeticOverflow)?
                / total_score;
            sp.stake
                .checked_add(bonus as u64)
                .ok_or(WorthHubError::ArithmeticOverflow)?
        } else if sp.revealed {
            // Revealed but total_score is 0 (e.g. truth == consensus) → return stake
            sp.stake
        } else {
            0
        };
        total_payout = total_payout
            .checked_add(payout)
            .ok_or(WorthHubError::ArithmeticOverflow)?;
        payouts.push(payout);
    }

    // Distribute rewards via CPI invoke_signed
    let vault_info = ctx.accounts.vault.to_account_info();
    let authority_info = ctx.accounts.authority.to_account_info();
    let system_prog = ctx.accounts.system_program.to_account_info();
    let topic_key_bytes = topic_key.as_ref();
    let vault_bump = topic.vault_bump;
    let bump_slice = &[vault_bump];
    let vault_signer_seeds: &[&[u8]] = &[b"vault", topic_key_bytes, bump_slice];

    // Cap total payout so vault keeps rent-exempt minimum
    let vault_balance = vault_info.lamports();
    let max_distributable = vault_balance.saturating_sub(rent_exempt_min);

    for (i, sp) in scored.iter().enumerate() {
        let participant_info = &remaining[sp.participant_index];
        let commitment_info = &remaining[sp.commitment_index];

        let mut payout = payouts[i];

        // Scale down if we'd exceed distributable amount
        if total_payout > max_distributable && total_payout > 0 {
            payout = (payout as u128 * max_distributable as u128 / total_payout as u128) as u64;
        }

        if payout > 0 {
            let current_vault = vault_info.lamports();
            let actual_payout = std::cmp::min(payout, current_vault.saturating_sub(rent_exempt_min));

            if actual_payout > 0 {
                system_program::transfer(
                    CpiContext::new_with_signer(
                        system_prog.clone(),
                        system_program::Transfer {
                            from: vault_info.clone(),
                            to: participant_info.clone(),
                        },
                        &[vault_signer_seeds],
                    ),
                    actual_payout,
                )?;
            }
        }

        // Mark commitment as settled
        let mut data = commitment_info.try_borrow_mut_data()?;
        // settled field is at offset: 8(disc) + 32(topic) + 32(participant) + 32(hash)
        //   + 8(stake) + 4(order) + 8(prediction) + 1(revealed) + 32(salt) = 157
        // settled is a bool at offset 157
        if data.len() > 157 {
            data[157] = 1; // true
        }
    }

    // Transfer remaining vault balance (minus rent) to authority as protocol fee
    let remaining_vault = vault_info.lamports().saturating_sub(rent_exempt_min);
    if remaining_vault > 0 {
        system_program::transfer(
            CpiContext::new_with_signer(
                system_prog.clone(),
                system_program::Transfer {
                    from: vault_info.clone(),
                    to: authority_info.clone(),
                },
                &[vault_signer_seeds],
            ),
            remaining_vault,
        )?;
    }

    // Mark topic as settled
    let topic = &mut ctx.accounts.topic;
    topic.status = TopicStatus::Settled;

    msg!(
        "Topic settled: id={}, truth={}, consensus={}, participants={}, loser_pool={}",
        topic.topic_id,
        truth,
        consensus,
        scored.len(),
        loser_pool
    );

    Ok(())
}
