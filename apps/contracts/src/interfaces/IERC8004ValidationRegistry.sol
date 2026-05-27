// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004ValidationRegistry
/// @notice ERC-8004 interface for third-party validation hooks (TEE oracles, ZK verifiers,
///         manual auditors). Validation records are appended and never mutated.
interface IERC8004ValidationRegistry {
    /// @notice Categories of validation that can be submitted.
    enum ValidationKind {
        TEE_ATTESTATION, // Phala dstack TDX quote (Camada 5)
        ZK_PROOF, // zero-knowledge proof (future)
        MANUAL_AUDIT, // human reviewer with VALIDATOR_ROLE
        BENCHMARK_RESULT, // standardised, verifiable benchmark
        CUSTOM // escape hatch for future kinds
    }

    /// @notice On-chain record for a single validation submission.
    /// @dev `expiresAt == 0` means the record never expires.
    ///      `flagsJson` is a compact JSON string — kept small to limit on-chain cost.
    struct ValidationRecord {
        uint256 tokenId;
        ValidationKind kind;
        address validator;
        bytes32 evidenceHash;
        string evidenceURI;
        uint8 score;
        uint64 timestamp;
        uint64 expiresAt;
        string flagsJson;
    }

    /// @notice Submit a validation proof for an agent identity token.
    /// @param tokenId      Identity token of the agent being validated.
    /// @param kind         Category of validation.
    /// @param evidenceHash keccak256 of the raw evidence (TEE quote, ZK proof, report).
    /// @param evidenceURI  URI where the full evidence can be retrieved.
    /// @param score        Validation score 0–100.
    /// @param expiresAt    Unix timestamp after which the record is inactive (0 = permanent).
    /// @param flagsJson    Compact JSON-encoded flag string.
    function submitValidation(
        uint256 tokenId,
        ValidationKind kind,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        uint8 score,
        uint64 expiresAt,
        string calldata flagsJson
    ) external;

    /// @notice Return all validation records for a token (including expired).
    function getValidations(uint256 tokenId) external view returns (ValidationRecord[] memory);

    /// @notice Return only non-expired validation records for a token.
    function getActiveValidations(uint256 tokenId) external view returns (ValidationRecord[] memory);
}
