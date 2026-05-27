// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {MoltverseValidationRegistry} from "../src/MoltverseValidationRegistry.sol";
import {BaseTest} from "./helpers/TestHelpers.sol";

/// @notice Unit tests for MoltverseValidationRegistry.
///         Covers TC.16 – TC.19 from contracts-erc8004.md §10.2.
contract ValidationRegistryTest is BaseTest {
    event ValidationSubmitted(
        uint256 indexed tokenId,
        MoltverseValidationRegistry.ValidationKind indexed kind,
        address indexed validator,
        uint8 score,
        bytes32 evidenceHash
    );
    event ValidatorApproved(address indexed validator, MoltverseValidationRegistry.ValidationKind kind);
    event ValidatorRevoked(address indexed validator, MoltverseValidationRegistry.ValidationKind kind);

    uint256 internal agentToken;

    bytes32 constant EVIDENCE = keccak256("tee-quote-bytes");
    string constant EVIDENCE_URI = "https://moltverse.social/attestations/1/0.bin";
    string constant FLAGS = "[]";

    function setUp() public override {
        super.setUp();
        agentToken = _mintId(alice, "alice");

        // Approve teeOracle for TEE_ATTESTATION.
        vm.startPrank(admin);
        validationRegistry.approveTEEValidator(teeOracle);
        // Grant VALIDATOR_ROLE to manualAuditor.
        validationRegistry.grantRole(validationRegistry.VALIDATOR_ROLE(), manualAuditor);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // TC.16 — TEE_ATTESTATION with approved validator succeeds
    // -------------------------------------------------------------------------

    function test_TC16_teeAttestation_approvedValidator_succeeds() public {
        uint64 expiresAt = uint64(block.timestamp + 90 days);

        vm.expectEmit(true, true, true, true);
        emit ValidationSubmitted(
            agentToken, MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION, teeOracle, 100, EVIDENCE
        );

        vm.prank(teeOracle);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            expiresAt,
            FLAGS
        );

        assertEq(validationRegistry.getValidations(agentToken).length, 1, "should have 1 validation");
        MoltverseValidationRegistry.ValidationRecord memory rec = validationRegistry.getValidations(agentToken)[0];
        assertEq(rec.tokenId, agentToken);
        assertEq(uint8(rec.kind), uint8(MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION));
        assertEq(rec.validator, teeOracle);
        assertEq(rec.score, 100);
        assertEq(rec.evidenceHash, EVIDENCE);
        assertEq(rec.expiresAt, expiresAt);
        assertGt(rec.timestamp, 0);
    }

    // -------------------------------------------------------------------------
    // TC.17 — TEE_ATTESTATION without allowlist approval reverts
    // -------------------------------------------------------------------------

    function test_TC17_teeAttestation_unapprovedValidator_reverts() public {
        vm.prank(attacker);
        vm.expectRevert(MoltverseValidationRegistry.UnauthorizedValidator.selector);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            0,
            FLAGS
        );
    }

    function test_TC17_zkProof_unapprovedValidator_reverts() public {
        // ZK_PROOF requires approvedZKValidators — teeOracle is only TEE-approved.
        vm.prank(teeOracle);
        vm.expectRevert(MoltverseValidationRegistry.UnauthorizedValidator.selector);
        validationRegistry.submitValidation(
            agentToken, MoltverseValidationRegistry.ValidationKind.ZK_PROOF, EVIDENCE, EVIDENCE_URI, 90, 0, FLAGS
        );
    }

    function test_TC17_zkProof_approvedValidator_succeeds() public {
        vm.prank(admin);
        validationRegistry.approveZKValidator(charlie);

        vm.prank(charlie);
        validationRegistry.submitValidation(
            agentToken, MoltverseValidationRegistry.ValidationKind.ZK_PROOF, EVIDENCE, EVIDENCE_URI, 90, 0, FLAGS
        );

        assertEq(validationRegistry.getValidations(agentToken).length, 1);
    }

    // -------------------------------------------------------------------------
    // TC.18 — MANUAL_AUDIT with VALIDATOR_ROLE succeeds
    // -------------------------------------------------------------------------

    function test_TC18_manualAudit_withRole_succeeds() public {
        vm.prank(manualAuditor);
        validationRegistry.submitValidation(
            agentToken, MoltverseValidationRegistry.ValidationKind.MANUAL_AUDIT, EVIDENCE, EVIDENCE_URI, 85, 0, FLAGS
        );

        assertEq(validationRegistry.getValidations(agentToken).length, 1);
        assertEq(validationRegistry.getValidations(agentToken)[0].score, 85);
    }

    function test_TC18_manualAudit_withoutRole_reverts() public {
        vm.prank(attacker);
        vm.expectRevert(MoltverseValidationRegistry.UnauthorizedValidator.selector);
        validationRegistry.submitValidation(
            agentToken, MoltverseValidationRegistry.ValidationKind.MANUAL_AUDIT, EVIDENCE, EVIDENCE_URI, 85, 0, FLAGS
        );
    }

    function test_TC18_benchmarkResult_withRole_succeeds() public {
        vm.prank(manualAuditor);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.BENCHMARK_RESULT,
            EVIDENCE,
            EVIDENCE_URI,
            70,
            0,
            FLAGS
        );

        assertEq(validationRegistry.getValidations(agentToken)[0].score, 70);
    }

    function test_TC18_custom_withRole_succeeds() public {
        vm.prank(manualAuditor);
        validationRegistry.submitValidation(
            agentToken, MoltverseValidationRegistry.ValidationKind.CUSTOM, EVIDENCE, EVIDENCE_URI, 60, 0, FLAGS
        );

        assertEq(validationRegistry.getValidations(agentToken)[0].score, 60);
    }

    // -------------------------------------------------------------------------
    // TC.19 — getActiveValidations filters out expired records
    // -------------------------------------------------------------------------

    function test_TC19_getActiveValidations_filtersExpired() public {
        // Warp to a timestamp > 1 so that block.timestamp - 1 > 0 (expiresAt == 0 means "never expires").
        vm.warp(100);

        // Record 1: expires in 1 day.
        uint64 expiresIn1Day = uint64(block.timestamp + 1 days);
        // Record 2: already expired (1 second ago, which is > 0 so treated as a real deadline).
        uint64 alreadyExpired = uint64(block.timestamp - 1);
        // Record 3: never expires (expiresAt == 0).
        uint64 neverExpires = 0;

        vm.startPrank(teeOracle);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            expiresIn1Day,
            FLAGS
        );
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            50,
            alreadyExpired,
            FLAGS
        );
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            75,
            neverExpires,
            FLAGS
        );
        vm.stopPrank();

        // All 3 are returned by getValidations.
        assertEq(validationRegistry.getValidations(agentToken).length, 3, "getValidations should return all");

        // Only 2 are active (not the expired one).
        MoltverseValidationRegistry.ValidationRecord[] memory active =
            validationRegistry.getActiveValidations(agentToken);
        assertEq(active.length, 2, "getActiveValidations should return only 2");
        assertEq(active[0].score, 100, "first active is the 1-day record");
        assertEq(active[1].score, 75, "second active is the permanent record");
    }

    function test_TC19_getActiveValidations_afterExpiry_isEmpty() public {
        uint64 expiresAt = uint64(block.timestamp + 10);

        vm.prank(teeOracle);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            expiresAt,
            FLAGS
        );

        // Before expiry: 1 active.
        assertEq(validationRegistry.getActiveValidations(agentToken).length, 1);

        // After expiry: 0 active.
        vm.warp(block.timestamp + 11);
        assertEq(validationRegistry.getActiveValidations(agentToken).length, 0);

        // getValidations still returns the expired record.
        assertEq(validationRegistry.getValidations(agentToken).length, 1);
    }

    // -------------------------------------------------------------------------
    // Additional coverage: revoked token blocks new validations
    // -------------------------------------------------------------------------

    function test_submitValidation_revokedToken_reverts() public {
        vm.prank(admin);
        identityRegistry.revokeIdentity(agentToken, "banned");

        vm.prank(teeOracle);
        vm.expectRevert(MoltverseValidationRegistry.TokenRevoked.selector);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            0,
            FLAGS
        );
    }

    // -------------------------------------------------------------------------
    // Additional coverage: validator allowlist management events
    // -------------------------------------------------------------------------

    function test_approveTEEValidator_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ValidatorApproved(charlie, MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION);

        vm.prank(admin);
        validationRegistry.approveTEEValidator(charlie);
        assertTrue(validationRegistry.approvedTEEValidators(charlie));
    }

    function test_revokeTEEValidator_blocksSubmissions() public {
        vm.prank(admin);
        validationRegistry.revokeTEEValidator(teeOracle);

        assertFalse(validationRegistry.approvedTEEValidators(teeOracle));

        vm.prank(teeOracle);
        vm.expectRevert(MoltverseValidationRegistry.UnauthorizedValidator.selector);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            0,
            FLAGS
        );
    }

    function test_approveZKValidator_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ValidatorApproved(charlie, MoltverseValidationRegistry.ValidationKind.ZK_PROOF);

        vm.prank(admin);
        validationRegistry.approveZKValidator(charlie);
    }

    function test_validatorAdmin_noRole_reverts() public {
        bytes32 validatorAdminRole = validationRegistry.VALIDATOR_ADMIN_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, validatorAdminRole
            )
        );
        validationRegistry.approveTEEValidator(attacker);
    }

    // -------------------------------------------------------------------------
    // Additional coverage: pause
    // -------------------------------------------------------------------------

    function test_submitValidation_whenPaused_reverts() public {
        vm.prank(admin);
        validationRegistry.pause();

        vm.prank(teeOracle);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            0,
            FLAGS
        );
    }

    // -------------------------------------------------------------------------
    // Additional coverage: flagsJson stored correctly
    // -------------------------------------------------------------------------

    function test_submitValidation_flagsJson_storedCorrectly() public {
        string memory flags = '{"confidence":0.95,"method":"tdx"}';

        vm.prank(teeOracle);
        validationRegistry.submitValidation(
            agentToken,
            MoltverseValidationRegistry.ValidationKind.TEE_ATTESTATION,
            EVIDENCE,
            EVIDENCE_URI,
            100,
            0,
            flags
        );

        assertEq(validationRegistry.getValidations(agentToken)[0].flagsJson, flags);
    }
}
