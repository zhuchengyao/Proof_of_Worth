use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use crate::errors::WorthHubError;
use crate::state::{Commitment, Topic, TopicStatus};

#[derive(Accounts)]
pub struct RevealPrediction<'info> {
    pub participant: Signer<'info>,

    #[account(
        mut,
        constraint = (topic.status == TopicStatus::Open || topic.status == TopicStatus::Revealing)
            @ WorthHubError::InvalidTopicState,
    )]
    pub topic: Account<'info, Topic>,

    #[account(
        mut,
        seeds = [b"commitment", topic.key().as_ref(), participant.key().as_ref()],
        bump = commitment.bump,
        constraint = commitment.participant == participant.key(),
        constraint = !commitment.revealed @ WorthHubError::AlreadyRevealed,
    )]
    pub commitment: Account<'info, Commitment>,
}

pub fn handle_reveal(
    ctx: Context<RevealPrediction>,
    prediction_value: i64,
    salt: [u8; 32],
) -> Result<()> {
    let topic = &ctx.accounts.topic;

    // Check we're in the reveal window:
    // After commit deadline, before reveal deadline
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= topic.commit_deadline,
        WorthHubError::CommitPhaseNotEnded
    );
    require!(
        clock.unix_timestamp < topic.reveal_deadline,
        WorthHubError::RevealPhaseEnded
    );

    // Verify hash: keccak256(prediction_value || salt || participant_address)
    let participant_key = ctx.accounts.participant.key();
    let mut hash_input = Vec::with_capacity(8 + 32 + 32);
    hash_input.extend_from_slice(&prediction_value.to_le_bytes());
    hash_input.extend_from_slice(&salt);
    hash_input.extend_from_slice(participant_key.as_ref());

    let computed_hash = keccak::hash(&hash_input);
    require!(
        computed_hash.0 == ctx.accounts.commitment.commitment_hash,
        WorthHubError::HashMismatch
    );

    // Update commitment with revealed values
    let commitment = &mut ctx.accounts.commitment;
    commitment.prediction_value = prediction_value;
    commitment.salt = salt;
    commitment.revealed = true;

    // Update topic state
    let topic = &mut ctx.accounts.topic;
    topic.reveal_count += 1;

    // Transition to Revealing status if still Open
    if topic.status == TopicStatus::Open {
        topic.status = TopicStatus::Revealing;
    }

    msg!(
        "Commitment revealed: participant={}, prediction={}",
        commitment.participant,
        prediction_value
    );
    Ok(())
}
