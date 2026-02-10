use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8qXNZGRTwYeAw3fdPsaqJ3cq5ieyZWtxrXTZizmuZFeQ");

#[program]
pub mod worth_hub {
    use super::*;

    /// Create a new prediction topic
    pub fn create_topic(
        ctx: Context<CreateTopic>,
        topic_id: u64,
        description: String,
        symbol: String,
        commit_deadline: i64,
        reveal_deadline: i64,
        min_stake: u64,
    ) -> Result<()> {
        handle_create_topic(
            ctx,
            topic_id,
            description,
            symbol,
            commit_deadline,
            reveal_deadline,
            min_stake,
        )
    }

    /// Submit a commitment (hash + stake) for a topic
    pub fn commit(
        ctx: Context<CommitPrediction>,
        commitment_hash: [u8; 32],
        stake_amount: u64,
    ) -> Result<()> {
        handle_commit(ctx, commitment_hash, stake_amount)
    }

    /// Reveal the prediction value and salt
    pub fn reveal(
        ctx: Context<RevealPrediction>,
        prediction_value: i64,
        salt: [u8; 32],
    ) -> Result<()> {
        handle_reveal(ctx, prediction_value, salt)
    }

    /// Oracle submits the true value
    pub fn finalize(ctx: Context<FinalizeTopic>, truth_value: i64) -> Result<()> {
        handle_finalize(ctx, truth_value)
    }

    /// Calculate rewards and distribute SOL
    pub fn settle<'info>(ctx: Context<'_, '_, 'info, 'info, SettleTopic<'info>>) -> Result<()> {
        handle_settle(ctx)
    }
}
