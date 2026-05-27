// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MoltverseIdentityRegistry} from "../src/MoltverseIdentityRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

/// @notice Fuzz tests for MoltverseIdentityRegistry DID validation.
///         TC.24 — any deterministically-constructed valid handle always mints.
///         TC.25 — known-invalid DID patterns always revert.
contract IdentityRegistryFuzzTest is BaseTest {
    // -------------------------------------------------------------------------
    // TC.24 — Fuzz: constructed valid handles always succeed
    // -------------------------------------------------------------------------

    /// @dev The fuzzer supplies an arbitrary seed. We build a deterministic valid
    ///      handle from it using the _buildValidHandle helper and verify mint succeeds.
    ///      setUp() is called before every fuzz run, so the registry is always fresh.
    function testFuzz_TC24_validHandle_mintSucceeds(bytes32 seed) public {
        string memory handle = _buildValidHandle(uint256(seed));
        string memory did = string.concat("did:web:moltverse.social:agent:", handle);

        vm.prank(minter);
        uint256 tokenId = identityRegistry.mint(alice, did, "ipfs://test.json");

        assertGt(tokenId, 0, "tokenId must be non-zero");
        assertEq(identityRegistry.didOfToken(tokenId), did, "did mapping incorrect");
        assertEq(identityRegistry.tokenOfDid(did), tokenId, "reverse did mapping incorrect");
        assertEq(identityRegistry.ownerOf(tokenId), alice, "alice should own the token");
    }

    // -------------------------------------------------------------------------
    // TC.25 — Fuzz: invalid DID patterns always revert
    // -------------------------------------------------------------------------

    /// @dev First char outside [a-z] (0x61–0x7a) always causes DidFormatInvalid.
    ///      We pick a char from [0x00–0x60] ∪ [0x7b–0xff] and build a handle.
    function testFuzz_TC25_invalidFirstChar_reverts(uint8 firstChar, bytes3 rest) public {
        // Ensure firstChar is NOT in [a-z].
        vm.assume(firstChar < 0x61 || firstChar > 0x7a);

        // Build handle: 1 invalid first char + 3 valid continuation bytes.
        // Continuation chars are forced into [a-z] to isolate the first-char failure.
        bytes memory handleBytes = new bytes(4);
        handleBytes[0] = bytes1(firstChar);
        for (uint256 i = 0; i < 3; i++) {
            // Map each byte into [a-z].
            handleBytes[i + 1] = bytes1(uint8(0x61 + (uint8(rest[i]) % 26)));
        }

        string memory did = string.concat("did:web:moltverse.social:agent:", string(handleBytes));

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    /// @dev Invalid continuation character anywhere in the handle causes DidFormatInvalid.
    function testFuzz_TC25_invalidContChar_reverts(uint8 badChar) public {
        // Pick a char outside [a-z0-9_-].
        vm.assume(badChar != 0x5f && badChar != 0x2d); // not _ or -
        vm.assume(badChar < 0x30 || badChar > 0x39); // not 0-9
        vm.assume(badChar < 0x61 || badChar > 0x7a); // not a-z

        // Handle: valid first char + bad second char + valid third char.
        bytes memory handleBytes = new bytes(3);
        handleBytes[0] = "a"; // valid
        handleBytes[1] = bytes1(badChar); // invalid continuation
        handleBytes[2] = "b"; // valid

        string memory did = string.concat("did:web:moltverse.social:agent:", string(handleBytes));

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(MoltverseIdentityRegistry.DidFormatInvalid.selector, did));
        identityRegistry.mint(alice, did, "uri");
    }

    /// @dev Handles that are too short (< 3 chars) or too long (> 30 chars) are rejected.
    function testFuzz_TC25_handleLengthOutOfBounds_reverts(uint8 rawLen) public {
        // We want len < 3 or len > 30.
        vm.assume(rawLen < 3 || rawLen > 30);
        vm.assume(rawLen <= 60); // cap to avoid huge allocations

        bytes memory handleBytes = new bytes(rawLen);
        if (rawLen > 0) {
            handleBytes[0] = "a"; // valid first char
            for (uint256 i = 1; i < rawLen; i++) {
                handleBytes[i] = "b";
            }
        }

        string memory did = string.concat("did:web:moltverse.social:agent:", string(handleBytes));

        vm.prank(minter);
        vm.expectRevert(); // DidFormatInvalid (or length check before prefix if rawLen == 0)
        identityRegistry.mint(alice, did, "uri");
    }

    // -------------------------------------------------------------------------
    // Additional fuzz: multiple sequential mints — no collision, IDs increment
    // -------------------------------------------------------------------------

    function testFuzz_multipleMints_uniqueIds(uint8 count) public {
        vm.assume(count > 1 && count <= 20);

        for (uint256 i = 0; i < count; i++) {
            string memory handle = _buildValidHandle(i);
            vm.prank(minter);
            uint256 tokenId =
                identityRegistry.mint(alice, string.concat("did:web:moltverse.social:agent:", handle), "uri");
            assertEq(tokenId, i + 1, "token IDs must be consecutive starting at 1");
        }
    }
}
