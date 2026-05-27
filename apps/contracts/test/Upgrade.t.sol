// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {MoltverseIdentityRegistry} from "../src/MoltverseIdentityRegistry.sol";
import {MoltverseReputationRegistry} from "../src/MoltverseReputationRegistry.sol";
import {MoltverseValidationRegistry} from "../src/MoltverseValidationRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mock V2 contracts — minimal additions to prove upgrade works and storage
// is preserved. A new `version()` pure function is the only change.
// ─────────────────────────────────────────────────────────────────────────────

/// @custom:oz-upgrades-unsafe-allow constructor
contract MockIdentityRegistryV2 is MoltverseIdentityRegistry {
    function version() external pure returns (string memory) {
        return "2";
    }
}

/// @custom:oz-upgrades-unsafe-allow constructor
contract MockReputationRegistryV2 is MoltverseReputationRegistry {
    constructor(MoltverseIdentityRegistry _identityRegistry) MoltverseReputationRegistry(_identityRegistry) {}

    function version() external pure returns (string memory) {
        return "2";
    }
}

/// @custom:oz-upgrades-unsafe-allow constructor
contract MockValidationRegistryV2 is MoltverseValidationRegistry {
    constructor(MoltverseIdentityRegistry _identityRegistry) MoltverseValidationRegistry(_identityRegistry) {}

    function version() external pure returns (string memory) {
        return "2";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test contract
// ─────────────────────────────────────────────────────────────────────────────

/// @notice Upgrade tests for all three registries.
///         TC.20 — upgradeToAndCall without UPGRADER_ROLE reverts.
///         TC.21 — upgradeToAndCall with UPGRADER_ROLE succeeds; new functions callable.
///         TC.22 — storage is fully preserved across the V1→V2 upgrade.
contract UpgradeTest is BaseTest {
    // -------------------------------------------------------------------------
    // TC.20 — Upgrade without UPGRADER_ROLE reverts
    // -------------------------------------------------------------------------

    function test_TC20_identityRegistry_upgradeWithoutRole_reverts() public {
        MockIdentityRegistryV2 v2Impl = new MockIdentityRegistryV2();
        bytes32 upgraderRole = identityRegistry.UPGRADER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, upgraderRole)
        );
        identityRegistry.upgradeToAndCall(address(v2Impl), "");
    }

    function test_TC20_reputationRegistry_upgradeWithoutRole_reverts() public {
        MockReputationRegistryV2 v2Impl = new MockReputationRegistryV2(identityRegistry);
        bytes32 upgraderRole = reputationRegistry.UPGRADER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, upgraderRole)
        );
        reputationRegistry.upgradeToAndCall(address(v2Impl), "");
    }

    function test_TC20_validationRegistry_upgradeWithoutRole_reverts() public {
        MockValidationRegistryV2 v2Impl = new MockValidationRegistryV2(identityRegistry);
        bytes32 upgraderRole = validationRegistry.UPGRADER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, upgraderRole)
        );
        validationRegistry.upgradeToAndCall(address(v2Impl), "");
    }

    // -------------------------------------------------------------------------
    // TC.21 — Upgrade with UPGRADER_ROLE succeeds; V2 function is reachable
    // -------------------------------------------------------------------------

    function test_TC21_identityRegistry_upgradeWithRole_succeeds() public {
        MockIdentityRegistryV2 v2Impl = new MockIdentityRegistryV2();

        vm.prank(admin);
        identityRegistry.upgradeToAndCall(address(v2Impl), "");

        // Cast the same proxy to V2 and call the new function.
        MockIdentityRegistryV2 v2 = MockIdentityRegistryV2(address(identityRegistry));
        assertEq(v2.version(), "2", "version() should return '2' after upgrade");
    }

    function test_TC21_reputationRegistry_upgradeWithRole_succeeds() public {
        MockReputationRegistryV2 v2Impl = new MockReputationRegistryV2(identityRegistry);

        vm.prank(admin);
        reputationRegistry.upgradeToAndCall(address(v2Impl), "");

        assertEq(MockReputationRegistryV2(address(reputationRegistry)).version(), "2");
    }

    function test_TC21_validationRegistry_upgradeWithRole_succeeds() public {
        MockValidationRegistryV2 v2Impl = new MockValidationRegistryV2(identityRegistry);

        vm.prank(admin);
        validationRegistry.upgradeToAndCall(address(v2Impl), "");

        assertEq(MockValidationRegistryV2(address(validationRegistry)).version(), "2");
    }

    // -------------------------------------------------------------------------
    // TC.22 — Storage is preserved across V1 → V2 upgrade
    // -------------------------------------------------------------------------

    function test_TC22_identityRegistry_storagePreserved() public {
        // Set state before upgrade.
        uint256 tokenId = _mintId(alice, "alice");
        string memory expectedDid = "did:web:moltverse.social:agent:alice";

        vm.prank(admin);
        identityRegistry.revokeIdentity(tokenId, "test-revoke");

        uint256 revokedAtBefore = identityRegistry.revokedAt(tokenId);

        // Upgrade.
        MockIdentityRegistryV2 v2Impl = new MockIdentityRegistryV2();
        vm.prank(admin);
        identityRegistry.upgradeToAndCall(address(v2Impl), "");

        // All pre-upgrade state must be intact.
        assertEq(identityRegistry.ownerOf(tokenId), alice, "ownerOf preserved");
        assertEq(identityRegistry.didOfToken(tokenId), expectedDid, "didOfToken preserved");
        assertEq(identityRegistry.tokenOfDid(expectedDid), tokenId, "tokenOfDid preserved");
        assertTrue(identityRegistry.isRevoked(tokenId), "isRevoked preserved");
        assertEq(identityRegistry.revokedAt(tokenId), revokedAtBefore, "revokedAt preserved");
        assertEq(identityRegistry.revokeReason(tokenId), "test-revoke", "revokeReason preserved");
    }

    function test_TC22_reputationRegistry_storagePreserved() public {
        uint256 fromToken = _mintId(alice, "from");
        uint256 aboutToken = _mintId(bob, "about");

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signFeedback(ALICE_KEY, fromToken, aboutToken, 42, 0, bytes32(0), 1, deadline);
        reputationRegistry.submitFeedback(fromToken, aboutToken, 42, 0, bytes32(0), 1, deadline, sig);

        bytes32 nonceKeyBefore = keccak256(abi.encode(fromToken, aboutToken, uint256(1)));
        assertTrue(reputationRegistry.consumedNonces(nonceKeyBefore));

        // Upgrade.
        MockReputationRegistryV2 v2Impl = new MockReputationRegistryV2(identityRegistry);
        vm.prank(admin);
        reputationRegistry.upgradeToAndCall(address(v2Impl), "");

        // State preserved.
        assertEq(reputationRegistry.getFeedbackCount(aboutToken), 1, "feedback count preserved");
        assertEq(reputationRegistry.getFeedback(aboutToken, 0).value, 42, "feedback value preserved");
        assertTrue(reputationRegistry.consumedNonces(nonceKeyBefore), "consumed nonce preserved");
    }

    function test_TC22_validationRegistry_storagePreserved() public {
        uint256 tokenId = _mintId(alice, "alice");

        vm.prank(admin);
        validationRegistry.approveTEEValidator(teeOracle);

        vm.prank(teeOracle);
        validationRegistry.submitValidation(
            tokenId, MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION, bytes32(uint256(1)), "uri", 99, 0, "[]"
        );

        // Upgrade.
        MockValidationRegistryV2 v2Impl = new MockValidationRegistryV2(identityRegistry);
        vm.prank(admin);
        validationRegistry.upgradeToAndCall(address(v2Impl), "");

        // Allowlist and validation records preserved.
        assertTrue(validationRegistry.approvedTEEValidators(teeOracle), "TEE allowlist preserved");
        assertEq(validationRegistry.getValidations(tokenId).length, 1, "validation count preserved");
        assertEq(validationRegistry.getValidations(tokenId)[0].score, 99, "score preserved");
    }

    // -------------------------------------------------------------------------
    // TC.22 — Post-upgrade operations still work correctly
    // -------------------------------------------------------------------------

    function test_TC22_identityRegistry_postUpgrade_mintWorks() public {
        MockIdentityRegistryV2 v2Impl = new MockIdentityRegistryV2();
        vm.prank(admin);
        identityRegistry.upgradeToAndCall(address(v2Impl), "");

        // Mint should still work on the upgraded proxy.
        vm.prank(minter);
        uint256 tokenId = identityRegistry.mint(alice, "did:web:moltverse.social:agent:alice", "ipfs://alice.json");
        assertEq(tokenId, 1);
        assertEq(identityRegistry.ownerOf(1), alice);
    }
}
