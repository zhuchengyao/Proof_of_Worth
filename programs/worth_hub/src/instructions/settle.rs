use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WorthHubError;
use crate::state::{Commitment, Topic, TopicStatus};

/// Fixed-point precision: 1e6
const PRECISION: u128 = 1_000_000;

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

pub fn handle_settle<'info>(ctx: Context<'_, '_, 'info, 'info, SettleTopic<'info>>) -> Result<()> {
    let topic = &ctx.accounts.topic;
    let truth = topic.truth_value;
    let topic_key = topic.key();

    // Parse remaining accounts as commitment + participant pairs
    let remaining = &ctx.remaining_accounts;
    require!(remaining.len() % 2 == 0, WorthHubError::NoRevealedCommitments);
    require!(!remaining.is_empty(), WorthHubError::NoRevealedCommitments);

    let pair_count = remaining.len() / 2;

    // First pass: compute scores for all revealed commitments
    struct ParticipantScore {
        commitment_index: usize,
        participant_index: usize,
        stake: u64,
        score: u128,
        revealed: bool,
    }

    let mut scores: Vec<ParticipantScore> = Vec::with_capacity(pair_count);
    let mut total_score: u128 = 0;
    let mut total_revealed_stake: u64 = 0;
    let mut total_unrevealed_stake: u64 = 0;

    for i in 0..pair_count {
        let commitment_info = &remaining[i * 2];
        let data = commitment_info.try_borrow_data()?;

        // Skip 8-byte discriminator
        let commitment: Commitment =
            Commitment::try_deserialize(&mut &data[..])
                .map_err(|_| WorthHubError::NoRevealedCommitments)?;

        if commitment.revealed {
            // W_e = PRECISION / (|truth - prediction| + 1)
            let error = (truth - commitment.prediction_value).unsigned_abs() as u128;
            let w_e = PRECISION * PRECISION / (error + 1);

            // T_f = PRECISION / ln(N + e)
            let ln_val = ln_approx(commitment.submit_order);
            let t_f = PRECISION * PRECISION / ln_val;

            // Score = W_e * T_f / PRECISION (to keep in PRECISION scale)
            let score = w_e * t_f / PRECISION;

            total_score = total_score
                .checked_add(score)
                .ok_or(WorthHubError::ArithmeticOverflow)?;
            total_revealed_stake = total_revealed_stake
                .checked_add(commitment.stake_amount)
                .ok_or(WorthHubError::ArithmeticOverflow)?;

            scores.push(ParticipantScore {
                commitment_index: i * 2,
                participant_index: i * 2 + 1,
                stake: commitment.stake_amount,
                score,
                revealed: true,
            });
        } else {
            total_unrevealed_stake = total_unrevealed_stake
                .checked_add(commitment.stake_amount)
                .ok_or(WorthHubError::ArithmeticOverflow)?;

            scores.push(ParticipantScore {
                commitment_index: i * 2,
                participant_index: i * 2 + 1,
                stake: commitment.stake_amount,
                score: 0,
                revealed: false,
            });
        }
    }

    // The "loser pool" is the unrevealed stakes (people who didn't reveal forfeit)
    let loser_pool = total_unrevealed_stake as u128;

    // We need to keep the vault rent-exempt. A 0-data account needs ~890_880 lamports.
    // Reserve this from the pool.
    let rent = Rent::get()?;
    let rent_exempt_min = rent.minimum_balance(0);

    // Calculate all payouts first
    let mut payouts: Vec<u64> = Vec::with_capacity(scores.len());
    let mut total_payout: u64 = 0;

    for ps in &scores {
        let payout: u64 = if ps.revealed && total_score > 0 {
            let bonus = loser_pool
                .checked_mul(ps.score)
                .ok_or(WorthHubError::ArithmeticOverflow)?
                / total_score;
            ps.stake
                .checked_add(bonus as u64)
                .ok_or(WorthHubError::ArithmeticOverflow)?
        } else if ps.revealed {
            ps.stake
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

    for (i, ps) in scores.iter().enumerate() {
        let participant_info = &remaining[ps.participant_index];
        let commitment_info = &remaining[ps.commitment_index];

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
        "Topic settled: id={}, truth={}, participants={}, loser_pool={}",
        topic.topic_id,
        truth,
        scores.len(),
        loser_pool
    );

    Ok(())
}
