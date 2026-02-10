use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::WorthHubError;
use crate::state::{Commitment, Topic, TopicStatus};

#[derive(Accounts)]
pub struct CommitPrediction<'info> {
    #[account(mut)]
    pub participant: Signer<'info>,

    #[account(
        mut,
        constraint = topic.status == TopicStatus::Open @ WorthHubError::InvalidTopicState,
    )]
    pub topic: Account<'info, Topic>,

    #[account(
        init,
        payer = participant,
        space = Commitment::MAX_SIZE,
        seeds = [b"commitment", topic.key().as_ref(), participant.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, Commitment>,

    /// The vault PDA that holds staked SOL
    /// CHECK: Validated by seeds constraint
    #[account(
        mut,
        seeds = [b"vault", topic.key().as_ref()],
        bump = topic.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_commit(
    ctx: Context<CommitPrediction>,
    commitment_hash: [u8; 32],
    stake_amount: u64,
) -> Result<()> {
    let topic = &ctx.accounts.topic;

    // Check commit deadline
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < topic.commit_deadline,
        WorthHubError::CommitPhaseEnded
    );

    // Check minimum stake
    require!(stake_amount > 0, WorthHubError::ZeroStake);
    require!(
        stake_amount >= topic.min_stake,
        WorthHubError::StakeTooLow
    );

    // Transfer SOL from participant to vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.participant.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        stake_amount,
    )?;

    // Record commitment
    let commitment = &mut ctx.accounts.commitment;
    commitment.topic = ctx.accounts.topic.key();
    commitment.participant = ctx.accounts.participant.key();
    commitment.commitment_hash = commitment_hash;
    commitment.stake_amount = stake_amount;
    commitment.submit_order = ctx.accounts.topic.commitment_count;
    commitment.prediction_value = 0;
    commitment.revealed = false;
    commitment.salt = [0u8; 32];
    commitment.settled = false;
    commitment.bump = ctx.bumps.commitment;

    // Update topic
    let topic = &mut ctx.accounts.topic;
    topic.commitment_count += 1;
    topic.total_stake = topic
        .total_stake
        .checked_add(stake_amount)
        .ok_or(WorthHubError::ArithmeticOverflow)?;

    msg!(
        "Commitment #{} received, stake={} lamports",
        topic.commitment_count - 1,
        stake_amount
    );
    Ok(())
}
