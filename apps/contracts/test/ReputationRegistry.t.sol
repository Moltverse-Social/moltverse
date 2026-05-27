// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {MoltverseReputationRegistry} from "../src/MoltverseReputationRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

/// @notice Unit tests for MoltverseReputationRegistry.
///         Covers TC.10 – TC.15 from contracts-erc8004.md §10.2.
contract ReputationRegistryTest is BaseTest {
    event FeedbackSubmitted(
        uint256 indexed fromTokenId,
        uint256 indexed aboutTokenId,
        int128 value,
        bytes32 evidenceHash,
        uint256 indexed nonce
    );

    // Shared test parameters
    int128 constant VALUE = 75;
    uint8 constant VALUE_DECIMALS = 0;
    bytes32 constant EVIDENCE = keccak256("evidence-blob");
    uint256 constant NONCE = 1;

    uint256 internal fromToken;
    uint256 internal aboutToken;

    function setUp() public override {
        super.setUp();
        // Alice owns fromToken (ALICE_KEY), bob owns aboutToken.
        fromToken = _mintId(alice, "alice");
        aboutToken = _mintId(bob, "bob");
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _aliceSig(uint256 nonce_, uint256 deadline_) internal view returns (bytes memory) {
        return _signFeedback(ALICE_KEY, fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, nonce_, deadline_);
    }

    // -------------------------------------------------------------------------
    // TC.10 — submitFeedback: valid EIP-712 signature succeeds
    // -------------------------------------------------------------------------

    function test_TC10_submitFeedback_validSig_succeeds() public {
        uint256 deadline = _deadline();
        bytes memory sig = _aliceSig(NONCE, deadline);

        vm.expectEmit(true, true, false, true);
        emit FeedbackSubmitted(fromToken, aboutToken, VALUE, EVIDENCE, NONCE);

        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);

        // Verify stored record.
        assertEq(reputationRegistry.getFeedbackCount(aboutToken), 1, "feedback count should be 1");
        MoltverseReputationRegistry.FeedbackRecord memory rec = reputationRegistry.getFeedback(aboutToken, 0);
        assertEq(rec.fromTokenId, fromToken);
        assertEq(rec.aboutTokenId, aboutToken);
        assertEq(rec.value, VALUE);
        assertEq(rec.valueDecimals, VALUE_DECIMALS);
        assertEq(rec.evidenceHash, EVIDENCE);
        assertGt(rec.timestamp, 0, "timestamp must be set");
    }

    function test_TC10_consumedNonce_isSet() public {
        uint256 deadline = _deadline();
        reputationRegistry.submitFeedback(
            fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, _aliceSig(NONCE, deadline)
        );

        bytes32 nonceKey = keccak256(abi.encode(fromToken, aboutToken, NONCE));
        assertTrue(reputationRegistry.consumedNonces(nonceKey), "nonce should be consumed");
    }

    // -------------------------------------------------------------------------
    // TC.11 — submitFeedback: non-owner signer reverts with InvalidSignature
    // -------------------------------------------------------------------------

    function test_TC11_submitFeedback_nonOwnerSig_reverts() public {
        uint256 deadline = _deadline();
        // Sign with BOB_KEY — bob does not own fromToken.
        bytes memory sig =
            _signFeedback(BOB_KEY, fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.InvalidSignature.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_TC11_submitFeedback_malformedSig_reverts() public {
        uint256 deadline = _deadline();
        bytes memory badSig = new bytes(65); // all-zero signature

        vm.expectRevert(MoltverseReputationRegistry.InvalidSignature.selector);
        reputationRegistry.submitFeedback(
            fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, badSig
        );
    }

    // -------------------------------------------------------------------------
    // TC.12 — submitFeedback: duplicate nonce reverts with NonceAlreadyUsed
    // -------------------------------------------------------------------------

    function test_TC12_submitFeedback_duplicateNonce_reverts() public {
        uint256 deadline = _deadline();
        bytes memory sig = _aliceSig(NONCE, deadline);

        // First submission succeeds.
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);

        // Second submission with same nonce reverts.
        vm.expectRevert(MoltverseReputationRegistry.NonceAlreadyUsed.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_TC12_differentNonce_succeeds() public {
        uint256 deadline = _deadline();
        reputationRegistry.submitFeedback(
            fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, 1, deadline, _aliceSig(1, deadline)
        );
        reputationRegistry.submitFeedback(
            fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, 2, deadline, _aliceSig(2, deadline)
        );
        assertEq(reputationRegistry.getFeedbackCount(aboutToken), 2);
    }

    // -------------------------------------------------------------------------
    // TC.13 — submitFeedback: expired deadline reverts with DeadlineExpired
    // -------------------------------------------------------------------------

    function test_TC13_submitFeedback_expiredDeadline_reverts() public {
        uint256 deadline = block.timestamp - 1; // already expired
        bytes memory sig = _aliceSig(NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.DeadlineExpired.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_TC13_submitFeedback_exactDeadline_succeeds() public {
        // deadline == block.timestamp is accepted (not strictly greater).
        uint256 deadline = block.timestamp;
        bytes memory sig = _aliceSig(NONCE, deadline);

        // Should NOT revert (block.timestamp > deadline is false when equal).
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
        assertEq(reputationRegistry.getFeedbackCount(aboutToken), 1);
    }

    // -------------------------------------------------------------------------
    // TC.14 — submitFeedback: self-feedback reverts with SelfFeedback
    // -------------------------------------------------------------------------

    function test_TC14_submitFeedback_selfFeedback_reverts() public {
        uint256 deadline = _deadline();
        // fromToken == aboutToken
        bytes memory sig =
            _signFeedback(ALICE_KEY, fromToken, fromToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.SelfFeedback.selector);
        reputationRegistry.submitFeedback(fromToken, fromToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    // -------------------------------------------------------------------------
    // TC.14b — submitFeedback: non-existent fromToken/aboutToken revert
    //          with InvalidFromToken/InvalidAboutToken (code-review F3)
    // -------------------------------------------------------------------------

    function test_TC14b_submitFeedback_nonexistentFromToken_reverts() public {
        uint256 deadline = _deadline();
        uint256 ghostToken = 999_999;
        bytes memory sig =
            _signFeedback(ALICE_KEY, ghostToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.InvalidFromToken.selector);
        reputationRegistry.submitFeedback(ghostToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_TC14b_submitFeedback_nonexistentAboutToken_reverts() public {
        uint256 deadline = _deadline();
        uint256 ghostToken = 999_999;
        bytes memory sig =
            _signFeedback(ALICE_KEY, fromToken, ghostToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.InvalidAboutToken.selector);
        reputationRegistry.submitFeedback(fromToken, ghostToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    // -------------------------------------------------------------------------
    // TC.15 — submitFeedback: revoked fromToken reverts with TokenRevoked
    // -------------------------------------------------------------------------

    function test_TC15_submitFeedback_revokedFromToken_reverts() public {
        vm.prank(admin);
        identityRegistry.revokeIdentity(fromToken, "banned");

        uint256 deadline = _deadline();
        bytes memory sig = _aliceSig(NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.TokenRevoked.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_TC15_submitFeedback_revokedAboutToken_reverts() public {
        vm.prank(admin);
        identityRegistry.revokeIdentity(aboutToken, "banned");

        uint256 deadline = _deadline();
        bytes memory sig = _aliceSig(NONCE, deadline);

        vm.expectRevert(MoltverseReputationRegistry.TokenRevoked.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    // -------------------------------------------------------------------------
    // Additional coverage: pause / access control
    // -------------------------------------------------------------------------

    function test_submitFeedback_whenPaused_reverts() public {
        vm.prank(admin);
        reputationRegistry.pause();

        // Pre-compute signature before vm.expectRevert to avoid consuming the cheatcode
        // with the FEEDBACK_TYPEHASH() view call inside _signFeedback.
        uint256 deadline = _deadline();
        bytes memory sig = _aliceSig(NONCE, deadline);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        reputationRegistry.submitFeedback(fromToken, aboutToken, VALUE, VALUE_DECIMALS, EVIDENCE, NONCE, deadline, sig);
    }

    function test_pause_noRole_reverts() public {
        bytes32 pauserRole = reputationRegistry.PAUSER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, pauserRole)
        );
        reputationRegistry.pause();
    }

    // -------------------------------------------------------------------------
    // Additional coverage: getFeedbackBatch pagination
    // -------------------------------------------------------------------------

    function test_getFeedbackBatch_paginationIsCorrect() public {
        uint256 deadline = _deadline();
        // Submit 5 feedbacks with different nonces, values, and evidenceHashes.
        // Must sign the exact parameters passed to submitFeedback (not the shared VALUE/EVIDENCE constants).
        for (uint256 i = 1; i <= 5; i++) {
            bytes memory sig =
                _signFeedback(ALICE_KEY, fromToken, aboutToken, int128(int256(i)), 0, bytes32(i), i, deadline);
            reputationRegistry.submitFeedback(fromToken, aboutToken, int128(int256(i)), 0, bytes32(i), i, deadline, sig);
        }

        // Page 1: offset=0, limit=3 → [0,1,2]
        MoltverseReputationRegistry.FeedbackRecord[] memory page = reputationRegistry.getFeedbackBatch(aboutToken, 0, 3);
        assertEq(page.length, 3);
        assertEq(page[0].value, 1);
        assertEq(page[2].value, 3);

        // Page 2: offset=3, limit=3 → [3,4] (only 2 remain)
        page = reputationRegistry.getFeedbackBatch(aboutToken, 3, 3);
        assertEq(page.length, 2);
        assertEq(page[0].value, 4);
        assertEq(page[1].value, 5);

        // Offset beyond end → empty array
        page = reputationRegistry.getFeedbackBatch(aboutToken, 10, 3);
        assertEq(page.length, 0);
    }

    // -------------------------------------------------------------------------
    // Additional coverage: negative feedback value (reputation decrease)
    // -------------------------------------------------------------------------

    function test_submitFeedback_negativeValue_succeeds() public {
        int128 negValue = -50;
        uint256 deadline = _deadline();
        bytes memory sig = _signFeedback(ALICE_KEY, fromToken, aboutToken, negValue, 0, EVIDENCE, NONCE, deadline);

        reputationRegistry.submitFeedback(fromToken, aboutToken, negValue, 0, EVIDENCE, NONCE, deadline, sig);

        MoltverseReputationRegistry.FeedbackRecord memory rec = reputationRegistry.getFeedback(aboutToken, 0);
        assertEq(rec.value, negValue);
    }
}
