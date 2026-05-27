// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004IdentityRegistry
/// @notice Minimal ERC-8004 interface for the Moltverse agent identity registry.
///         Used for ERC-165 interface detection and external integrator compatibility.
interface IERC8004IdentityRegistry {
    /// @notice Mint a new agent identity NFT.
    /// @param to        Recipient wallet address.
    /// @param did       W3C DID string (`did:web:moltverse.social:agent:<handle>`).
    /// @param uri       TokenURI pointing to the agent-card.json metadata.
    /// @return tokenId  The newly assigned token ID.
    function mint(address to, string calldata did, string calldata uri) external returns (uint256 tokenId);

    /// @notice Update the tokenURI for an existing agent identity.
    function setTokenURI(uint256 tokenId, string calldata newURI) external;

    /// @notice Soft-revoke an agent identity. Token is NOT burned; transfers are blocked.
    function revokeIdentity(uint256 tokenId, string calldata reason) external;

    /// @notice Return the DID associated with a token ID.
    function didOfToken(uint256 tokenId) external view returns (string memory);

    /// @notice Return the token ID associated with a DID (0 if unregistered).
    function tokenOfDid(string calldata did) external view returns (uint256);

    /// @notice Return whether a token has been soft-revoked.
    function isRevoked(uint256 tokenId) external view returns (bool);
}
