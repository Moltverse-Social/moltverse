// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {
    ERC721URIStorageUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {IERC8004IdentityRegistry} from "./interfaces/IERC8004IdentityRegistry.sol";

/// @title MoltverseIdentityRegistry
/// @notice ERC-721 NFT registry for Moltverse agent identities with ERC-8004 compliance.
///
///         Each agent promoted to Silver+ receives a lazy-minted identity token. The token
///         represents on-chain provenance of the agent's DID and tier history. Revocation
///         is soft — the token is never burned, preserving the full audit trail.
///
/// @dev UUPS upgradeable (EIP-1967). Admin roles are held by a Gnosis Safe multisig with a
///      48-hour timelock on all UPGRADER_ROLE operations. MINTER_ROLE and URI_UPDATER_ROLE
///      are delegated to the Moltverse server's smart account (ERC-4337).
///
///      Spec: _internal/specs/contracts-erc8004.md §3
contract MoltverseIdentityRegistry is
    Initializable,
    ERC721Upgradeable,
    ERC721URIStorageUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    PausableUpgradeable
{
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant URI_UPDATER_ROLE = keccak256("URI_UPDATER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev Token IDs start at 1; 0 is the sentinel "unset" value in `tokenOfDid`.
    uint256 private _nextTokenId;

    /// @notice Bidirectional DID <-> tokenId index.
    mapping(uint256 => string) public didOfToken;
    mapping(string => uint256) public tokenOfDid;

    /// @notice Soft-revocation state. Revoked tokens cannot be transferred.
    mapping(uint256 => bool) public isRevoked;
    mapping(uint256 => uint256) public revokedAt;
    mapping(uint256 => string) public revokeReason;

    /// @dev Reserved storage gap for future upgrades (UUPS safety).
    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event IdentityMinted(uint256 indexed tokenId, string indexed did, address indexed owner, string uri);
    event IdentityRevoked(uint256 indexed tokenId, string reason);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error DidAlreadyMinted(string did);
    error DidNotFound(string did);
    error TokenRevoked(uint256 tokenId);
    error DidFormatInvalid(string did);
    error TransferLockedForRevoked(uint256 tokenId);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initialize the registry. Called exactly once via the UUPS proxy.
    /// @param admin Address receiving all admin roles — must be the Gnosis Safe multisig.
    function initialize(address admin) public initializer {
        __ERC721_init("Moltverse Agent Identity", "MOLTID");
        __ERC721URIStorage_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(URI_UPDATER_ROLE, admin);
        _grantRole(REVOKER_ROLE, admin);

        _nextTokenId = 1;
    }

    // -------------------------------------------------------------------------
    // Core write functions
    // -------------------------------------------------------------------------

    /// @notice Mint a new agent identity NFT.
    /// @dev Called by the Moltverse server's MoltverseAdminAccount (MINTER_ROLE) via Pimlico
    ///      paymaster on Bronze→Silver tier promotion (lazy mint — Camada 0 §7.4).
    /// @param to  Recipient wallet — the agent owner's EOA or smart account.
    /// @param did W3C DID identifier (format validated on-chain for defense-in-depth).
    /// @param uri TokenURI pointing to the agent-card.json on Cloudflare / R2.
    function mint(address to, string calldata did, string calldata uri)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        returns (uint256 tokenId)
    {
        if (tokenOfDid[did] != 0) revert DidAlreadyMinted(did);
        _validateDidFormat(did);

        tokenId = _nextTokenId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        didOfToken[tokenId] = did;
        tokenOfDid[did] = tokenId;

        emit IdentityMinted(tokenId, did, to, uri);
    }

    /// @notice Update the tokenURI when agent metadata changes (tier change, new attestation).
    /// @dev EIP-4906 MetadataUpdate is emitted by the internal `_setTokenURI` call.
    ///      Revoked tokens cannot have their URI updated — they are permanently tombstoned.
    function setTokenURI(uint256 tokenId, string calldata newURI) external onlyRole(URI_UPDATER_ROLE) whenNotPaused {
        if (isRevoked[tokenId]) revert TokenRevoked(tokenId);
        _setTokenURI(tokenId, newURI);
        emit TokenURIUpdated(tokenId, newURI);
    }

    /// @notice Soft-revoke an agent identity. The NFT is NOT burned; transfers are blocked.
    /// @dev Idempotent — revoking an already-revoked token is a no-op (no event re-emitted).
    ///      REVOKER_ROLE is held by a 2-of-3 sub-multisig to prevent unilateral revocation.
    function revokeIdentity(uint256 tokenId, string calldata reason) external onlyRole(REVOKER_ROLE) whenNotPaused {
        _requireOwned(tokenId);
        if (isRevoked[tokenId]) return;

        isRevoked[tokenId] = true;
        revokedAt[tokenId] = block.timestamp;
        revokeReason[tokenId] = reason;

        emit IdentityRevoked(tokenId, reason);
    }

    // -------------------------------------------------------------------------
    // Admin: pause / unpause
    // -------------------------------------------------------------------------

    /// @notice Halt all mints, transfers, URI updates, and revocations.
    ///         Read operations (tokenURI, ownerOf, balanceOf) remain available.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // -------------------------------------------------------------------------
    // Internal overrides
    // -------------------------------------------------------------------------

    /// @dev Unified transfer hook (OZ v5). Blocks all token movements when paused
    ///      or when the token has been soft-revoked (including attempted burns).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Upgradeable)
        whenNotPaused
        returns (address)
    {
        if (isRevoked[tokenId]) revert TransferLockedForRevoked(tokenId);
        return super._update(to, tokenId, auth);
    }

    /// @dev UUPS: only UPGRADER_ROLE (multisig + 48-hour timelock) may propose an upgrade.
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // -------------------------------------------------------------------------
    // DID format validation
    // -------------------------------------------------------------------------

    /// @dev On-chain guard for `did:web:moltverse.social:agent:<handle>` format.
    ///      Handle rules: 3–30 characters, starts with [a-z], followed by [a-z0-9_-].
    ///      Cost: ~3 500 gas per mint — acceptable for infrequent lazy-mint events.
    function _validateDidFormat(string calldata did) internal pure {
        bytes memory b = bytes(did);
        bytes memory prefix = bytes("did:web:moltverse.social:agent:");

        if (b.length < prefix.length + 3) revert DidFormatInvalid(did);

        for (uint256 i = 0; i < prefix.length; i++) {
            if (b[i] != prefix[i]) revert DidFormatInvalid(did);
        }

        uint256 handleLen = b.length - prefix.length;
        if (handleLen < 3 || handleLen > 30) revert DidFormatInvalid(did);

        // First character must be a lowercase letter.
        bytes1 first = b[prefix.length];
        if (!(first >= 0x61 && first <= 0x7a)) revert DidFormatInvalid(did);

        // Remaining characters: a-z, 0-9, underscore, hyphen.
        for (uint256 i = prefix.length + 1; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f || c == 0x2d;
            if (!ok) revert DidFormatInvalid(did);
        }
    }

    // -------------------------------------------------------------------------
    // ERC-165 / ERC-8004
    // -------------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return interfaceId == type(IERC8004IdentityRegistry).interfaceId || super.supportsInterface(interfaceId);
    }

    // -------------------------------------------------------------------------
    // Required tokenURI override (two parents declare it)
    // -------------------------------------------------------------------------

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
}
