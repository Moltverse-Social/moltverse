// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {MoltverseIdentityRegistry} from "../src/MoltverseIdentityRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/// @dev The fuzzer calls only functions defined here, keeping the invariant tests
///      focused. The handler tracks which tokens were minted and revoked so the
///      invariant assertions can iterate over the known set.
contract IdentityRegistryHandler is Test {
    MoltverseIdentityRegistry public immutable registry;

    address private immutable _admin;
    address private immutable _minter;

    // Track minted token IDs and their DIDs.
    uint256[] public mintedIds;
    mapping(uint256 => string) public didOf;

    // Track which IDs the handler revoked.
    mapping(uint256 => bool) public handlerRevoked;

    // Counter used to generate unique handles per call.
    uint256 private _handleCounter;

    constructor(MoltverseIdentityRegistry _registry, address admin_, address minter_) {
        registry = _registry;
        _admin = admin_;
        _minter = minter_;
    }

    // ── Exposed to the fuzzer ──────────────────────────────────────────────

    function mint(address to) external {
        // Bound `to` to non-zero, non-precompile addresses.
        if (to == address(0) || uint160(to) < 10) return;

        string memory handle = _nextHandle();
        string memory did = string.concat("did:web:moltverse.social:agent:", handle);

        vm.prank(_minter);
        try registry.mint(to, did, "ipfs://test.json") returns (uint256 tokenId) {
            mintedIds.push(tokenId);
            didOf[tokenId] = did;
        } catch {}
    }

    function revoke(uint256 idxSeed) external {
        if (mintedIds.length == 0) return;
        uint256 idx = idxSeed % mintedIds.length;
        uint256 tokenId = mintedIds[idx];

        if (!handlerRevoked[tokenId]) {
            vm.prank(_admin);
            try registry.revokeIdentity(tokenId, "handler-revoke") {
                handlerRevoked[tokenId] = true;
            } catch {}
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    function getMintedIds() external view returns (uint256[] memory) {
        return mintedIds;
    }

    function mintedCount() external view returns (uint256) {
        return mintedIds.length;
    }

    // Generates "hXXXXXX" handles — always valid (starts with 'h', 7 chars).
    function _nextHandle() private returns (string memory) {
        uint256 n = _handleCounter++;
        bytes memory b = new bytes(7);
        b[0] = "h";
        for (uint256 i = 6; i >= 1; i--) {
            b[i] = bytes1(uint8(0x30 + (n % 10)));
            n /= 10;
        }
        return string(b);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────

/// @notice Invariant tests for MoltverseIdentityRegistry.
///         TC.27 — tokenOfDid ↔ didOfToken are always bidirectional.
///         TC.28 — every token tracked by the handler exists in the registry.
///         TC.29 — revokedAt[id] > 0 iff isRevoked[id].
contract IdentityRegistryInvariantTest is BaseTest {
    IdentityRegistryHandler internal handler;

    function setUp() public override {
        super.setUp();

        handler = new IdentityRegistryHandler(identityRegistry, admin, minter);
        targetContract(address(handler));

        // Limit the fuzzer to these two handler functions.
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = IdentityRegistryHandler.mint.selector;
        selectors[1] = IdentityRegistryHandler.revoke.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // -------------------------------------------------------------------------
    // TC.27 — Bidirectional DID ↔ tokenId mapping
    // -------------------------------------------------------------------------

    function invariant_TC27_bidirectionalMapping() public {
        uint256[] memory ids = handler.getMintedIds();
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            string memory did = identityRegistry.didOfToken(tokenId);

            assertEq(identityRegistry.tokenOfDid(did), tokenId, "TC.27: tokenOfDid(didOfToken(id)) must equal id");
        }
    }

    // -------------------------------------------------------------------------
    // TC.28 — Every handler-tracked token exists in the registry
    // -------------------------------------------------------------------------

    function invariant_TC28_mintedTokensExist() public {
        uint256[] memory ids = handler.getMintedIds();
        for (uint256 i = 0; i < ids.length; i++) {
            // ownerOf reverts for non-existent tokens; if it returns without reverting
            // then the token exists.
            address owner = identityRegistry.ownerOf(ids[i]);
            assertTrue(owner != address(0), "TC.28: minted token must have a non-zero owner");
        }
    }

    // -------------------------------------------------------------------------
    // TC.29 — revokedAt > 0 iff isRevoked is true
    // -------------------------------------------------------------------------

    function invariant_TC29_revokedStateConsistent() public {
        uint256[] memory ids = handler.getMintedIds();
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            bool revoked = identityRegistry.isRevoked(tokenId);
            uint256 revokedAt = identityRegistry.revokedAt(tokenId);

            if (revoked) {
                assertGt(revokedAt, 0, "TC.29: revokedAt must be set when isRevoked is true");
            } else {
                assertEq(revokedAt, 0, "TC.29: revokedAt must be zero when isRevoked is false");
            }
        }
    }

    // -------------------------------------------------------------------------
    // Bonus: handler's revoked tracking must match on-chain state
    // -------------------------------------------------------------------------

    function invariant_handlerRevocationConsistent() public {
        uint256[] memory ids = handler.getMintedIds();
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            if (handler.handlerRevoked(tokenId)) {
                assertTrue(identityRegistry.isRevoked(tokenId), "handler says revoked but on-chain state disagrees");
            }
        }
    }
}
