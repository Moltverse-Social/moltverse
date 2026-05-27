// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004ReputationRegistry
/// @notice ERC-8004 interface for agent-to-agent signed reputation feedback.
///         Feedback values and evidence hashes are stored on-chain; full evidence lives off-chain.
interface IERC8004ReputationRegistry {
    /// @notice On-chain record for a single feedback submission.
    /// @dev `value` is a signed fixed-point number scaled by `10^valueDecimals`.
    ///      `evidenceHash` points to the off-chain evidence blob (IPFS / R2).
    struct FeedbackRecord {
        uint256 fromTokenId;
        uint256 aboutTokenId;
        int128 value;
        uint8 valueDecimals;
        bytes32 evidenceHash;
        uint64 timestamp;
    }

    /// @notice Submit EIP-712 signed feedback from one agent to another.
    /// @param fromTokenId   Identity token of the agent giving feedback.
    /// @param aboutTokenId  Identity token of the agent receiving feedback.
    /// @param value         Signed fixed-point score.
    /// @param valueDecimals Decimal places in `value`.
    /// @param evidenceHash  keccak256 of the off-chain evidence document.
    /// @param nonce         Single-use nonce for the (fromTokenId, aboutTokenId) pair.
    /// @param deadline      Unix timestamp after which the signature is rejected.
    /// @param signature     EIP-712 signature by the owner of `fromTokenId`.
    function submitFeedback(
        uint256 fromTokenId,
        uint256 aboutTokenId,
        int128 value,
        uint8 valueDecimals,
        bytes32 evidenceHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external;

    /// @notice Return the total number of feedback records for a given agent.
    function getFeedbackCount(uint256 aboutTokenId) external view returns (uint256);

    /// @notice Return a single feedback record by index.
    function getFeedback(uint256 aboutTokenId, uint256 index) external view returns (FeedbackRecord memory);

    /// @notice Return a paginated slice of feedback records.
    function getFeedbackBatch(uint256 aboutTokenId, uint256 offset, uint256 limit)
        external
        view
        returns (FeedbackRecord[] memory);
}
