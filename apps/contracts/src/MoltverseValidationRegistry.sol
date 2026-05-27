// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {MoltverseIdentityRegistry} from "./MoltverseIdentityRegistry.sol";

/// @title MoltverseValidationRegistry
/// @notice ERC-8004 validation hook registry for third-party proofs about agent identities.
///
///         Validators (TEE oracles, ZK verifiers, manual auditors) submit evidence records
///         that are appended and never mutated. Active records are those within their expiry
///         window (or permanent if `expiresAt == 0`).
///
///         TEE and ZK validators require explicit allowlist approval by VALIDATOR_ADMIN_ROLE.
///         MANUAL_AUDIT, BENCHMARK_RESULT, and CUSTOM require VALIDATOR_ROLE.
///
/// @dev UUPS upgradeable. `identityRegistry` is immutable and set in the constructor so
///      it is baked into the implementation bytecode rather than stored in proxy storage.
///
///      Spec: _internal/specs/contracts-erc8004.md §5
contract MoltverseValidationRegistry is Initializable, AccessControlUpgradeable, UUPSUpgradeable, PausableUpgradeable {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant VALIDATOR_ADMIN_ROLE = keccak256("VALIDATOR_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // -------------------------------------------------------------------------
    // Immutables
    // -------------------------------------------------------------------------

    /// @notice Identity registry used to verify token revocation status.
    /// @dev Immutable — embedded in implementation bytecode; survives UUPS upgrades.
    MoltverseIdentityRegistry public immutable identityRegistry;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

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
    ///      `flagsJson` is a compact JSON string kept small to limit on-chain cost.
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

    /// @notice tokenId => array of all validations (including expired).
    mapping(uint256 => ValidationRecord[]) public validationsOf;

    /// @notice Allowlist for TEE attestation validators (Camada 5 oracles).
    mapping(address => bool) public approvedTEEValidators;

    /// @notice Allowlist for ZK proof validators (future).
    mapping(address => bool) public approvedZKValidators;

    /// @dev Reserved storage gap for future upgrades.
    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ValidationSubmitted(
        uint256 indexed tokenId,
        ValidationKind indexed kind,
        address indexed validator,
        uint8 score,
        bytes32 evidenceHash
    );

    event ValidatorApproved(address indexed validator, ValidationKind kind);
    event ValidatorRevoked(address indexed validator, ValidationKind kind);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TokenRevoked();
    error UnauthorizedValidator();

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
        __UUPSUpgradeable_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VALIDATOR_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Core: submit validation
    // -------------------------------------------------------------------------

    /// @notice Submit a validation proof for an agent identity token.
    /// @dev TEE_ATTESTATION requires approvedTEEValidators[msg.sender].
    ///      ZK_PROOF requires approvedZKValidators[msg.sender].
    ///      All other kinds require VALIDATOR_ROLE.
    ///      Records are append-only and never mutated after submission.
    function submitValidation(
        uint256 tokenId,
        ValidationKind kind,
        bytes32 evidenceHash,
        string calldata evidenceURI,
        uint8 score,
        uint64 expiresAt,
        string calldata flagsJson
    ) external whenNotPaused {
        if (identityRegistry.isRevoked(tokenId)) revert TokenRevoked();

        bool isAuthorized;
        if (kind == ValidationKind.TEE_ATTESTATION) {
            isAuthorized = approvedTEEValidators[msg.sender];
        } else if (kind == ValidationKind.ZK_PROOF) {
            isAuthorized = approvedZKValidators[msg.sender];
        } else {
            isAuthorized = hasRole(VALIDATOR_ROLE, msg.sender);
        }
        if (!isAuthorized) revert UnauthorizedValidator();

        validationsOf[tokenId].push(
            ValidationRecord({
                tokenId: tokenId,
                kind: kind,
                validator: msg.sender,
                evidenceHash: evidenceHash,
                evidenceURI: evidenceURI,
                score: score,
                timestamp: uint64(block.timestamp),
                expiresAt: expiresAt,
                flagsJson: flagsJson
            })
        );

        emit ValidationSubmitted(tokenId, kind, msg.sender, score, evidenceHash);
    }

    // -------------------------------------------------------------------------
    // Read: validation queries
    // -------------------------------------------------------------------------

    /// @notice Return all validation records for a token (including expired).
    function getValidations(uint256 tokenId) external view returns (ValidationRecord[] memory) {
        return validationsOf[tokenId];
    }

    /// @notice Return only non-expired validation records for a token.
    /// @dev Two-pass: count then fill — avoids dynamic array resizing.
    function getActiveValidations(uint256 tokenId) external view returns (ValidationRecord[] memory) {
        ValidationRecord[] storage all = validationsOf[tokenId];

        uint256 activeCount;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].expiresAt == 0 || all[i].expiresAt > block.timestamp) {
                activeCount++;
            }
        }

        ValidationRecord[] memory active = new ValidationRecord[](activeCount);
        uint256 j;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].expiresAt == 0 || all[i].expiresAt > block.timestamp) {
                active[j++] = all[i];
            }
        }
        return active;
    }

    // -------------------------------------------------------------------------
    // Admin: validator allowlists
    // -------------------------------------------------------------------------

    function approveTEEValidator(address validator) external onlyRole(VALIDATOR_ADMIN_ROLE) {
        approvedTEEValidators[validator] = true;
        emit ValidatorApproved(validator, ValidationKind.TEE_ATTESTATION);
    }

    function revokeTEEValidator(address validator) external onlyRole(VALIDATOR_ADMIN_ROLE) {
        approvedTEEValidators[validator] = false;
        emit ValidatorRevoked(validator, ValidationKind.TEE_ATTESTATION);
    }

    function approveZKValidator(address validator) external onlyRole(VALIDATOR_ADMIN_ROLE) {
        approvedZKValidators[validator] = true;
        emit ValidatorApproved(validator, ValidationKind.ZK_PROOF);
    }

    function revokeZKValidator(address validator) external onlyRole(VALIDATOR_ADMIN_ROLE) {
        approvedZKValidators[validator] = false;
        emit ValidatorRevoked(validator, ValidationKind.ZK_PROOF);
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
