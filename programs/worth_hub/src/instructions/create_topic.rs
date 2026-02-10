use anchor_lang::prelude::*;
use crate::errors::WorthHubError;
use crate::state::{Topic, TopicStatus};

#[derive(Accounts)]
#[instruction(topic_id: u64, description: String, symbol: String)]
pub struct CreateTopic<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The oracle authority that will finalize this topic
    /// CHECK: This is just stored as a pubkey, no validation needed
    pub oracle_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = Topic::MAX_SIZE,
        seeds = [b"topic", topic_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub topic: Account<'info, Topic>,

    /// The vault PDA that will hold staked SOL
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        seeds = [b"vault", topic.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_topic(
    ctx: Context<CreateTopic>,
    topic_id: u64,
    description: String,
    symbol: String,
    commit_deadline: i64,
    reveal_deadline: i64,
    min_stake: u64,
) -> Result<()> {
    require!(description.len() <= 256, WorthHubError::DescriptionTooLong);
    require!(symbol.len() <= 32, WorthHubError::SymbolTooLong);

    let clock = Clock::get()?;
    require!(
        commit_deadline > clock.unix_timestamp,
        WorthHubError::InvalidDeadlines
    );
    require!(
        reveal_deadline > commit_deadline,
        WorthHubError::InvalidDeadlines
    );

    let topic = &mut ctx.accounts.topic;
    topic.authority = ctx.accounts.authority.key();
    topic.oracle_authority = ctx.accounts.oracle_authority.key();
    topic.topic_id = topic_id;
    topic.description = description;
    topic.symbol = symbol;
    topic.commit_deadline = commit_deadline;
    topic.reveal_deadline = reveal_deadline;
    topic.status = TopicStatus::Open;
    topic.truth_value = 0;
    topic.total_stake = 0;
    topic.commitment_count = 0;
    topic.reveal_count = 0;
    topic.min_stake = min_stake;
    topic.vault_bump = ctx.bumps.vault;
    topic.bump = ctx.bumps.topic;

    msg!("Topic created: id={}, symbol={}", topic_id, topic.symbol);
    Ok(())
}
