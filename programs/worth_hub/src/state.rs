use anchor_lang::prelude::*;

/// Status of a prediction topic
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TopicStatus {
    /// Accepting commitments
    Open,
    /// Commit phase ended, reveal phase active
    Revealing,
    /// Oracle has submitted truth value
    Finalized,
    /// Rewards have been distributed
    Settled,
}

/// A prediction topic that agents can bet on
#[account]
pub struct Topic {
    /// Authority who created this topic
    pub authority: Pubkey,
    /// Oracle authority who can finalize
    pub oracle_authority: Pubkey,
    /// Unique topic identifier
    pub topic_id: u64,
    /// Human-readable description (max 256 bytes)
    pub description: String,
    /// Trading symbol (e.g., "AAPL", "BTC-USD") max 32 bytes
    pub symbol: String,
    /// Unix timestamp: commit phase deadline
    pub commit_deadline: i64,
    /// Unix timestamp: reveal phase deadline
    pub reveal_deadline: i64,
    /// Current status
    pub status: TopicStatus,
    /// The true value submitted by oracle (fixed-point, 1e6 precision)
    pub truth_value: i64,
    /// Total SOL staked across all commitments (lamports)
    pub total_stake: u64,
    /// Number of commitments received
    pub commitment_count: u32,
    /// Number of commitments revealed
    pub reveal_count: u32,
    /// Minimum stake in lamports (e.g., 0.01 SOL = 10_000_000)
    pub min_stake: u64,
    /// Bump seed for the vault PDA
    pub vault_bump: u8,
    /// Bump seed for this topic PDA
    pub bump: u8,
}

impl Topic {
    /// Account space calculation
    /// discriminator(8) + pubkey(32)*2 + u64(8) + string(4+256) + string(4+32)
    /// + i64(8)*3 + status(1) + u64(8) + u32(4)*2 + u64(8) + u8(1)*2
    pub const MAX_SIZE: usize = 8 + 32 + 32 + 8 + (4 + 256) + (4 + 32)
        + 8 + 8 + 1 + 8 + 8 + 4 + 4 + 8 + 1 + 1;
}

/// A single participant's commitment to a topic
#[account]
pub struct Commitment {
    /// The topic this commitment belongs to
    pub topic: Pubkey,
    /// The participant who made this commitment
    pub participant: Pubkey,
    /// keccak256(prediction_value || salt || participant_address)
    pub commitment_hash: [u8; 32],
    /// Amount of SOL staked (lamports)
    pub stake_amount: u64,
    /// Order of submission (0-indexed, used for time decay)
    pub submit_order: u32,
    /// The predicted value (filled after reveal, fixed-point 1e6)
    pub prediction_value: i64,
    /// Whether this commitment has been revealed
    pub revealed: bool,
    /// The salt used (filled after reveal)
    pub salt: [u8; 32],
    /// Whether this participant has been paid out
    pub settled: bool,
    /// Bump seed for this commitment PDA
    pub bump: u8,
}

impl Commitment {
    /// discriminator(8) + pubkey(32)*2 + hash(32) + u64(8) + u32(4) + i64(8)
    /// + bool(1) + salt(32) + bool(1) + u8(1)
    pub const MAX_SIZE: usize = 8 + 32 + 32 + 32 + 8 + 4 + 8 + 1 + 32 + 1 + 1;
}
