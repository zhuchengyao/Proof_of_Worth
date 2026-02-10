use anchor_lang::prelude::*;
use crate::errors::WorthHubError;
use crate::state::{Topic, TopicStatus};

#[derive(Accounts)]
pub struct FinalizeTopic<'info> {
    pub oracle_authority: Signer<'info>,

    #[account(
        mut,
        constraint = topic.oracle_authority == oracle_authority.key()
            @ WorthHubError::UnauthorizedOracle,
        constraint = (topic.status == TopicStatus::Open || topic.status == TopicStatus::Revealing)
            @ WorthHubError::AlreadyFinalized,
    )]
    pub topic: Account<'info, Topic>,
}

pub fn handle_finalize(ctx: Context<FinalizeTopic>, truth_value: i64) -> Result<()> {
    let topic = &ctx.accounts.topic;

    // Oracle can finalize after the reveal deadline
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= topic.reveal_deadline,
        WorthHubError::RevealPhaseNotEnded
    );

    let topic = &mut ctx.accounts.topic;
    topic.truth_value = truth_value;
    topic.status = TopicStatus::Finalized;

    msg!(
        "Topic finalized: id={}, truth_value={}",
        topic.topic_id,
        truth_value
    );
    Ok(())
}
