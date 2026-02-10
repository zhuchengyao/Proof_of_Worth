use anchor_lang::prelude::*;

#[error_code]
pub enum WorthHubError {
    #[msg("Commit phase has ended")]
    CommitPhaseEnded,

    #[msg("Commit phase has not ended yet")]
    CommitPhaseNotEnded,

    #[msg("Reveal phase has ended")]
    RevealPhaseEnded,

    #[msg("Reveal phase has not ended yet")]
    RevealPhaseNotEnded,

    #[msg("Topic is not in the correct state for this operation")]
    InvalidTopicState,

    #[msg("Commitment hash does not match the revealed values")]
    HashMismatch,

    #[msg("Commitment has already been revealed")]
    AlreadyRevealed,

    #[msg("Commitment has not been revealed")]
    NotRevealed,

    #[msg("Stake amount must be greater than zero")]
    ZeroStake,

    #[msg("Stake amount is below the minimum required")]
    StakeTooLow,

    #[msg("Unauthorized: only the oracle authority can call this")]
    UnauthorizedOracle,

    #[msg("Unauthorized: only the topic authority can call this")]
    UnauthorizedAuthority,

    #[msg("Topic has already been settled")]
    AlreadySettled,

    #[msg("Topic has already been finalized")]
    AlreadyFinalized,

    #[msg("No revealed commitments to settle")]
    NoRevealedCommitments,

    #[msg("Arithmetic overflow in reward calculation")]
    ArithmeticOverflow,

    #[msg("Description too long (max 256 bytes)")]
    DescriptionTooLong,

    #[msg("Symbol too long (max 32 bytes)")]
    SymbolTooLong,

    #[msg("Invalid deadline configuration")]
    InvalidDeadlines,
}
