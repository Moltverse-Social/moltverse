// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {MoltverseIdentityRegistry} from "../src/MoltverseIdentityRegistry.sol";
import {IERC8004IdentityRegistry} from "../src/interfaces/IERC8004IdentityRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

/// @notice Unit tests for MoltverseIdentityRegistry.
///         Covers TC.1 – TC.9 and TC.23 from contracts-erc8004.md §10.2.
contract IdentityRegistryTest is BaseTest {
    // Redeclare events for vm.expectEmit (Solidity identifies events by keccak256 of their sig).
    event IdentityMinted(uint256 indexed tokenId, string indexed did, address indexed owner, string uri);
    event IdentityRevoked(uint256 indexed tokenId, string reason);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);
    event MetadataUpdate(uint256 _tokenId);

    // -------------------------------------------------------------------------
    // TC.1 — mint: valid DID emits event and updates all mappings
    // -------------------------------------------------------------------------

    function test_TC1_mint_validDid_succeeds() public {
        string memory did = "did:web:moltverse.social:agent:alice";
        string memory uri = "ipfs://alice.json";

        vm.expectEmit(true, true, true, true);
        emit IdentityMinted(1, did, alice, uri);

        vm.prank(minter);
        uint256 tokenId = identityRegistry.mint(alice, did, uri);

        assertEq(tokenId, 1, "tokenId should be 1");
        assertEq(identityRegistry.ownerOf(1), alice, "alice should own token 1");
        assertEq(identityRegistry.didOfToken(1), did, "did mapping mismatch");
        assertEq(identityRegistry.tokenOfDid(did), 1, "reverse did mapping mismatch");
    }

    // -------------------------------------------------------------------------
    // TC.2 — mint: duplicate DID reverts with DidAlreadyMinted
    // -------------------------------------------------------------------------

    function test_TC2_mint_duplicateDid_reverts() public {
        string memory did = "did:web:moltverse.social:agent:alice";

        _mintId(alice, "alice");

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidAlreadyMinted.selector, did));
        identityRegistry.mint(bob, did, "ipfs://other.json");
    }

    // -------------------------------------------------------------------------
    // TC.3 — mint: malformed DID (uppercase handle) reverts with DidFormatInvalid
    // -------------------------------------------------------------------------

    function test_TC3_mint_uppercaseHandle_reverts() public {
        string memory did = "did:web:moltverse.social:agent:UPPERCASE";

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_TC3_mint_digitFirstHandle_reverts() public {
        string memory did = "did:web:moltverse.social:agent:1abc";

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_TC3_mint_tooShortHandle_reverts() public {
        string memory did = "did:web:moltverse.social:agent:ab"; // 2 chars < 3

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_TC3_mint_tooLongHandle_reverts() public {
        // 31 chars — exceeds the 30-char maximum
        string memory did = "did:web:moltverse.social:agent:abcdefghijklmnopqrstuvwxyzabcde";

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_TC3_mint_wrongPrefix_reverts() public {
        string memory did = "did:key:moltverse.social:agent:alice";

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_TC3_mint_emptyDid_reverts() public {
        vm.prank(minter);
        vm.expectRevert(); // reverts — prefix check fails immediately
        identityRegistry.mint(alice, "", "uri");
    }

    // -------------------------------------------------------------------------
    // TC.4 — mint: caller without MINTER_ROLE reverts
    // -------------------------------------------------------------------------

    function test_TC4_mint_noRole_reverts() public {
        bytes32 minterRole = identityRegistry.MINTER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, minterRole)
        );
        identityRegistry.mint(alice, "did:web:moltverse.social:agent:alice", "uri");
    }

    // -------------------------------------------------------------------------
    // TC.5 — mint: paused registry reverts with EnforcedPause
    // -------------------------------------------------------------------------

    function test_TC5_mint_whenPaused_reverts() public {
        vm.prank(admin);
        identityRegistry.pause();

        vm.prank(minter);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        identityRegistry.mint(alice, "did:web:moltverse.social:agent:alice", "uri");
    }

    // -------------------------------------------------------------------------
    // TC.6 — transfer: non-revoked token transfers successfully
    // -------------------------------------------------------------------------

    function test_TC6_transfer_notRevoked_succeeds() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(alice);
        identityRegistry.transferFrom(alice, bob, tokenId);

        assertEq(identityRegistry.ownerOf(tokenId), bob, "bob should own the token after transfer");
    }

    // -------------------------------------------------------------------------
    // TC.7 — transfer: revoked token reverts with TransferLockedForRevoked
    // -------------------------------------------------------------------------

    function test_TC7_transfer_revoked_reverts() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "abuse");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.TransferLockedForRevoked.selector, tokenId));
        identityRegistry.transferFrom(alice, bob, tokenId);
    }

    // -------------------------------------------------------------------------
    // TC.8 — setTokenURI: emits EIP-4906 MetadataUpdate and TokenURIUpdated
    // -------------------------------------------------------------------------

    function test_TC8_setTokenURI_emitsMetadataUpdate() public {
        uint256 tokenId = _mintId(alice, "alice");
        string memory newURI = "ipfs://alice-v2.json";

        // ERC721URIStorageUpgradeable._setTokenURI emits MetadataUpdate(tokenId).
        vm.expectEmit(false, false, false, true);
        emit MetadataUpdate(tokenId);

        vm.prank(admin); // admin holds URI_UPDATER_ROLE
        identityRegistry.setTokenURI(tokenId, newURI);

        assertEq(identityRegistry.tokenURI(tokenId), newURI, "tokenURI should be updated");
    }

    function test_TC8_setTokenURI_emitsTokenURIUpdated() public {
        uint256 tokenId = _mintId(alice, "alice");
        string memory newURI = "ipfs://alice-v2.json";

        vm.expectEmit(true, false, false, true);
        emit TokenURIUpdated(tokenId, newURI);

        vm.prank(admin);
        identityRegistry.setTokenURI(tokenId, newURI);
    }

    function test_TC8_setTokenURI_revoked_reverts() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "tombstone");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.TokenRevoked.selector, tokenId));
        identityRegistry.setTokenURI(tokenId, "ipfs://new.json");
    }

    // -------------------------------------------------------------------------
    // TC.9 — revokeIdentity: already-revoked token is idempotent (no revert,
    //        no state mutation, no second IdentityRevoked event)
    // -------------------------------------------------------------------------

    function test_TC9_revokeIdentity_alreadyRevoked_isIdempotent() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "first");

        // Capture on-chain state immediately after first revoke.
        uint256 revokedAtAfterFirst = identityRegistry.revokedAt(tokenId);
        assertTrue(revokedAtAfterFirst > 0, "revokedAt should be set after first revoke");

        // Warp forward so a second revoke would change revokedAt if it weren't idempotent.
        vm.warp(block.timestamp + 1 days);

        // Second revoke must NOT revert.
        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "second");

        // State must reflect the first revocation only.
        assertTrue(identityRegistry.isRevoked(tokenId), "token should be revoked");
        assertEq(identityRegistry.revokeReason(tokenId), "first", "reason should be from first revoke");
        assertEq(identityRegistry.revokedAt(tokenId), revokedAtAfterFirst, "revokedAt should be unchanged");
    }

    function test_TC9_revokeIdentity_emitsEvent() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.expectEmit(true, false, false, true);
        emit IdentityRevoked(tokenId, "bad actor");

        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "bad actor");
    }

    function test_TC9_revokeIdentity_noRole_reverts() public {
        uint256 tokenId = _mintId(alice, "alice");

        bytes32 revokerRole = identityRegistry.REVOKER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, revokerRole)
        );
        identityRegistry.revokeIdentity(tokenId, "attempt");
    }

    // -------------------------------------------------------------------------
    // TC.23 — pause: halts mint and transfer; reads remain available
    // -------------------------------------------------------------------------

    function test_TC23_pause_haltsMints_allowsReads() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        identityRegistry.pause();

        // Reads still function during pause.
        assertEq(identityRegistry.ownerOf(tokenId), alice, "ownerOf should work while paused");
        assertFalse(bytes(identityRegistry.tokenURI(tokenId)).length == 0, "tokenURI should work");

        // Mint is blocked.
        vm.prank(minter);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        identityRegistry.mint(bob, "did:web:moltverse.social:agent:bob", "uri");
    }

    function test_TC23_pause_haltsTransfers() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        identityRegistry.pause();

        vm.prank(alice);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        identityRegistry.transferFrom(alice, bob, tokenId);
    }

    function test_TC23_unpause_resumesOperations() public {
        vm.startPrank(admin);
        identityRegistry.pause();
        identityRegistry.unpause();
        vm.stopPrank();

        // Mint should work again.
        vm.prank(minter);
        uint256 tokenId = identityRegistry.mint(alice, "did:web:moltverse.social:agent:alice", "uri");
        assertEq(tokenId, 1);
    }

    function test_TC23_pause_noRole_reverts() public {
        bytes32 pauserRole = identityRegistry.PAUSER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, pauserRole)
        );
        identityRegistry.pause();
    }

    // -------------------------------------------------------------------------
    // Additional coverage: token ID auto-increment
    // -------------------------------------------------------------------------

    function test_tokenIds_autoIncrement() public {
        uint256 t1 = _mintId(alice, "alice");
        uint256 t2 = _mintId(bob, "bob");
        uint256 t3 = _mintId(charlie, "charlie");

        assertEq(t1, 1);
        assertEq(t2, 2);
        assertEq(t3, 3);
    }

    // -------------------------------------------------------------------------
    // Additional coverage: DID validation edge cases
    // -------------------------------------------------------------------------

    function test_mint_validHandleWithUnderscoreAndHyphen_succeeds() public {
        vm.prank(minter);
        uint256 tokenId = identityRegistry.mint(alice, "did:web:moltverse.social:agent:a_b-c", "uri");
        assertEq(tokenId, 1);
    }

    function test_mint_handleWithInvalidChar_reverts() public {
        string memory did = "did:web:moltverse.social:agent:a@bc";
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    function test_supportsInterface_ERC8004() public view {
        // Verify the registry declares support for all expected interfaces.
        assertTrue(
            identityRegistry.supportsInterface(type(IERC8004IdentityRegistry).interfaceId), "should support IERC8004"
        );
        assertTrue(identityRegistry.supportsInterface(0x80ac58cd), "should support ERC721");
        assertTrue(identityRegistry.supportsInterface(0x01ffc9a7), "should support ERC165");
    }
}
