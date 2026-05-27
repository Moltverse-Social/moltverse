// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {IERC8004ReputationRegistry} from "./interfaces/IERC8004ReputationRegistry.sol";
import {MoltverseIdentityRegistry} from "./MoltverseIdentityRegistry.sol";

/// @title MoltverseReputationRegistry
/// @notice ERC-8004 reputation registry that stores EIP-712 signed agent-to-agent feedback.
///
///         Each feedback record is authorised by the owner of the "from" identity token —
///         the signature is verified on-chain, so no trusted relayer is required. The
///         evidence (full reasoning, context) lives off-chain; only its hash is stored.
///
///         Aggregated reputation scores are computed off-chain by Camada 3 crons and
///         indexed via a subgraph on the FeedbackSubmitted events.
///
/// @dev UUPS upgradeable. `identityRegistry` is immutable and set in the constructor so
///      it is baked into the implementation bytecode rather than stored in proxy storage.
///
///      Spec: _internal/specs/contracts-erc8004.md §4
contract MoltverseReputationRegistry is
    IERC8004ReputationRegistry,
    Initializable,
    AccessControlUpgradeable,
    EIP712Upgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // -------------------------------------------------------------------------
    // EIP-712 typed-data constants
    // -------------------------------------------------------------------------

    /// @dev Type hash for the Feedback struct. Must stay in sync with the SDK's signTypedData call.
    bytes32 public constant FEEDBACK_TYPEHASH = keccak256(
        "Feedback(uint256 fromTokenId,uint256 aboutTokenId,int128 value,uint8 valueDecimals,bytes32 evidenceHash,uint256 nonce,uint256 deadline)"
    );

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Identity registry used to verify token ownership and revocation status.
    /// @dev Immutable — embedded in implementation bytecode; survives UUPS upgrades.
    MoltverseIdentityRegistry public immutable identityRegistry;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice aboutTokenId => array of feedback received.
    /// @dev `FeedbackRecord` is inherited from `IERC8004ReputationRegistry`
    ///      so the on-chain shape stays in lockstep with the interface.
    mapping(uint256 => FeedbackRecord[]) public feedbackOf;

    /// @notice Anti-replay index: keccak256(fromTokenId, aboutTokenId, nonce) => consumed.
    mapping(bytes32 => bool) public consumedNonces;

    /// @dev Reserved storage gap for future upgrades.
    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event FeedbackSubmitted(
        uint256 indexed fromTokenId,
        uint256 indexed aboutTokenId,
        int128 value,
        bytes32 evidenceHash,
        uint256 indexed nonce
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error InvalidFromToken();
    error InvalidAboutToken();
    error TokenRevoked();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error DeadlineExpired();
    error SelfFeedback();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(MoltverseIdentityRegistry _identityRegistry) {
        identityRegistry = _identityRegistry;
        _disableInitializers();
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initialize the registry. Called exactly once via the UUPS proxy.
    /// @param admin Address receiving all admin roles — must be the Gnosis Safe multisig.
    function initialize(address admin) public initializer {
        __AccessControl_init();
        __EIP712_init("MoltverseReputationRegistry", "1");
        __UUPSUpgradeable_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Core: submit feedback
    // -------------------------------------------------------------------------

    /// @notice Submit EIP-712 signed reputation feedback from one agent to another.
    /// @dev The signature must be produced by the owner of `fromTokenId` over the
    ///      EIP-712 typed-data struct. Each (fromTokenId, aboutTokenId, nonce) is
    ///      single-use — re-submitting with the same nonce reverts with NonceAlreadyUsed.
    function submitFeedback(
        uint256 fromTokenId,
        uint256 aboutTokenId,
        int128 value,
        uint8 valueDecimals,
        bytes32 evidenceHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external override whenNotPaused {
        // --- 1. Sanity checks ---
        if (fromTokenId == aboutTokenId) revert SelfFeedback();
        if (block.timestamp > deadline) revert DeadlineExpired();
        // Both tokens must exist. ownerOf reverts with ERC721NonexistentToken
        // on unminted IDs; we translate to domain-specific errors so callers
        // can distinguish "never minted" from "exists but revoked".
        if (!_tokenExists(fromTokenId)) revert InvalidFromToken();
        if (!_tokenExists(aboutTokenId)) revert InvalidAboutToken();
        if (identityRegistry.isRevoked(fromTokenId)) revert TokenRevoked();
        if (identityRegistry.isRevoked(aboutTokenId)) revert TokenRevoked();

        // --- 2. Anti-replay ---
        bytes32 nonceKey = keccak256(abi.encode(fromTokenId, aboutTokenId, nonce));
        if (consumedNonces[nonceKey]) revert NonceAlreadyUsed();

        // --- 3. EIP-712 signature verification ---
        bytes32 structHash = keccak256(
            abi.encode(
                FEEDBACK_TYPEHASH, fromTokenId, aboutTokenId, value, valueDecimals, evidenceHash, nonce, deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        (address signer, ECDSA.RecoverError recoverError,) = ECDSA.tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError) revert InvalidSignature();

        address owner = identityRegistry.ownerOf(fromTokenId);
        if (signer != owner) revert InvalidSignature();

        // --- 4. Persist ---
        consumedNonces[nonceKey] = true;
        feedbackOf[aboutTokenId].push(
            FeedbackRecord({
                fromTokenId: fromTokenId,
                aboutTokenId: aboutTokenId,
                value: value,
                valueDecimals: valueDecimals,
                evidenceHash: evidenceHash,
                timestamp: uint64(block.timestamp)
            })
        );

        emit FeedbackSubmitted(fromTokenId, aboutTokenId, value, evidenceHash, nonce);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Returns true if `tokenId` has been minted on the identity registry.
    ///      Wraps `ownerOf` in a low-level call to detect ERC721NonexistentToken
    ///      reverts without bubbling them up.
    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        try identityRegistry.ownerOf(tokenId) returns (address owner) {
            return owner != address(0);
        } catch {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Read: feedback queries
    // -------------------------------------------------------------------------

    function getFeedbackCount(uint256 aboutTokenId) external view override returns (uint256) {
        return feedbackOf[aboutTokenId].length;
    }

    function getFeedback(uint256 aboutTokenId, uint256 index) external view override returns (FeedbackRecord memory) {
        return feedbackOf[aboutTokenId][index];
    }

    /// @notice Return a paginated slice of feedback records.
    /// @param offset First index to return (0-based). Returns empty array if offset >= length.
    /// @param limit  Maximum number of records to return.
    function getFeedbackBatch(uint256 aboutTokenId, uint256 offset, uint256 limit)
        external
        view
        override
        returns (FeedbackRecord[] memory)
    {
        FeedbackRecord[] storage all = feedbackOf[aboutTokenId];
        if (offset >= all.length) return new FeedbackRecord[](0);

        uint256 end = offset + limit > all.length ? all.length : offset + limit;
        FeedbackRecord[] memory result = new FeedbackRecord[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = all[i];
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Admin: pause / unpause
    // -------------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // UUPS
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}
}
