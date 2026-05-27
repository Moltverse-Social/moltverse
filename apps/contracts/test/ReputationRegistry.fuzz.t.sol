// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MoltverseReputationRegistry} from "../src/MoltverseReputationRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

/// @notice Fuzz tests for MoltverseReputationRegistry signature verification.
///         TC.26 — only the owner of fromTokenId is ever accepted as a valid signer.
contract ReputationRegistryFuzzTest is BaseTest {
    uint256 internal fromToken;
    uint256 internal aboutToken;

    function setUp() public override {
        super.setUp();
        // alice owns fromToken (ALICE_KEY), bob owns aboutToken.
        fromToken = _mintId(alice, "from");
        aboutToken = _mintId(bob, "about");
    }

    // -------------------------------------------------------------------------
    // TC.26 — any signer that is not alice is rejected
    // -------------------------------------------------------------------------

    /// @dev The fuzzer picks an arbitrary private key. We exclude ALICE_KEY (which
    ///      would produce a valid signature for alice's token) and verify every other
    ///      key results in InvalidSignature.
    function testFuzz_TC26_randomSigner_onlyOwnerAccepted(uint256 signerKey) public {
        vm.assume(signerKey > 0);
        vm.assume(signerKey < SECP256K1_ORDER);
        vm.assume(signerKey != ALICE_KEY); // ALICE_KEY is the only key that should succeed

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signFeedback(signerKey, fromToken, aboutToken, 10, 0, bytes32(0), 1, deadline);

        vm.expectRevert(MoltverseReputationRegistry.InvalidSignature.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, 10, 0, bytes32(0), 1, deadline, sig);
    }

    /// @dev Positive counterpart: the owner's key (ALICE_KEY) is always accepted.
    function testFuzz_TC26_ownerSigner_alwaysAccepted(int128 value, uint8 valueDecimals, bytes32 evidenceHash) public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig =
            _signFeedback(ALICE_KEY, fromToken, aboutToken, value, valueDecimals, evidenceHash, 1, deadline);

        // Must not revert.
        reputationRegistry.submitFeedback(fromToken, aboutToken, value, valueDecimals, evidenceHash, 1, deadline, sig);
        assertEq(reputationRegistry.getFeedbackCount(aboutToken), 1);
    }

    // -------------------------------------------------------------------------
    // Additional fuzz: deadline boundary
    // -------------------------------------------------------------------------

    /// @dev Any deadline strictly in the past is always rejected.
    function testFuzz_expiredDeadline_reverts(uint256 warpSeconds) public {
        vm.assume(warpSeconds > 0 && warpSeconds < 365 days);
        vm.warp(block.timestamp + warpSeconds);

        uint256 expiredDeadline = block.timestamp - 1;
        bytes memory sig = _signFeedback(ALICE_KEY, fromToken, aboutToken, 10, 0, bytes32(0), 1, expiredDeadline);

        vm.expectRevert(MoltverseReputationRegistry.DeadlineExpired.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, 10, 0, bytes32(0), 1, expiredDeadline, sig);
    }
}
