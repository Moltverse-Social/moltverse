// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MoltverseIdentityRegistry} from "../../src/MoltverseIdentityRegistry.sol";
import {MoltverseReputationRegistry} from "../../src/MoltverseReputationRegistry.sol";
import {MoltverseValidationRegistry} from "../../src/MoltverseValidationRegistry.sol";

/// @notice Shared base for all Moltverse contract tests.
///
///         Deploys all three registries via ERC1967Proxy and sets up named actors.
///         Alice and Bob are created from known private keys so that their addresses
///         can be used as EIP-712 signers in reputation tests.
abstract contract BaseTest is Test {
    // -------------------------------------------------------------------------
    // Known private keys (for EIP-712 signing)
    // -------------------------------------------------------------------------

    uint256 internal constant ALICE_KEY = 0xA11CE;
    uint256 internal constant BOB_KEY = 0xB0B0B;
    // SECP256K1_ORDER is inherited from forge-std/Base.sol (via Test).

    // -------------------------------------------------------------------------
    // Actors
    // -------------------------------------------------------------------------

    address internal admin;
    address internal minter;
    address internal alice; // owns ALICE_KEY
    address internal bob; // owns BOB_KEY
    address internal charlie;
    address internal attacker;
    address internal teeOracle;
    address internal manualAuditor;

    // -------------------------------------------------------------------------
    // Contracts (proxies)
    // -------------------------------------------------------------------------

    MoltverseIdentityRegistry internal identityRegistry;
    MoltverseReputationRegistry internal reputationRegistry;
    MoltverseValidationRegistry internal validationRegistry;

    // -------------------------------------------------------------------------
    // setUp
    // -------------------------------------------------------------------------

    function setUp() public virtual {
        admin = makeAddr("admin");
        minter = makeAddr("minter");
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        charlie = makeAddr("charlie");
        attacker = makeAddr("attacker");
        teeOracle = makeAddr("teeOracle");
        manualAuditor = makeAddr("manualAuditor");

        // IdentityRegistry proxy
        MoltverseIdentityRegistry identityImpl = new MoltverseIdentityRegistry();
        identityRegistry = MoltverseIdentityRegistry(
            address(
                new ERC1967Proxy(address(identityImpl), abi.encodeCall(MoltverseIdentityRegistry.initialize, (admin)))
            )
        );

        // ReputationRegistry proxy
        MoltverseReputationRegistry reputationImpl = new MoltverseReputationRegistry(identityRegistry);
        reputationRegistry = MoltverseReputationRegistry(
            address(
                new ERC1967Proxy(
                    address(reputationImpl), abi.encodeCall(MoltverseReputationRegistry.initialize, (admin))
                )
            )
        );

        // ValidationRegistry proxy
        MoltverseValidationRegistry validationImpl = new MoltverseValidationRegistry(identityRegistry);
        validationRegistry = MoltverseValidationRegistry(
            address(
                new ERC1967Proxy(
                    address(validationImpl), abi.encodeCall(MoltverseValidationRegistry.initialize, (admin))
                )
            )
        );

        // Delegate MINTER_ROLE to dedicated minter so admin stays a clean multisig-like actor.
        // Use startPrank so the external MINTER_ROLE() view call doesn't consume the single prank.
        vm.startPrank(admin);
        identityRegistry.grantRole(identityRegistry.MINTER_ROLE(), minter);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Helpers: identity
    // -------------------------------------------------------------------------

    /// @dev Mint `did:web:moltverse.social:agent:<handle>` to `to` via the minter.
    function _mintId(address to, string memory handle) internal returns (uint256 tokenId) {
        vm.prank(minter);
        tokenId = identityRegistry.mint(
            to, string.concat("did:web:moltverse.social:agent:", handle), string.concat("ipfs://", handle, ".json")
        );
    }

    // -------------------------------------------------------------------------
    // Helpers: EIP-712
    // -------------------------------------------------------------------------

    /// @dev Build and sign an EIP-712 Feedback struct using `signerKey`.
    ///      The domain separator is recomputed from the proxy's address and the
    ///      current block.chainid — matching exactly what the contract computes.
    function _signFeedback(
        uint256 signerKey,
        uint256 fromTokenId,
        uint256 aboutTokenId,
        int128 value,
        uint8 valueDecimals,
        bytes32 evidenceHash,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory sig) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("MoltverseReputationRegistry"),
                keccak256("1"),
                block.chainid,
                address(reputationRegistry)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                reputationRegistry.FEEDBACK_TYPEHASH(),
                fromTokenId,
                aboutTokenId,
                value,
                valueDecimals,
                evidenceHash,
                nonce,
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // -------------------------------------------------------------------------
    // Helpers: DID construction
    // -------------------------------------------------------------------------

    /// @dev Construct a deterministic valid DID handle from a uint256 seed.
    ///      Output: "h" + 6 decimal digits, e.g. "h000042". Always 7 chars, always valid.
    function _buildValidHandle(uint256 seed) internal pure returns (string memory) {
        uint256 n = seed % 1_000_000; // 000000 – 999999
        bytes memory b = new bytes(7);
        b[0] = "h";
        for (uint256 i = 6; i >= 1; i--) {
            b[i] = bytes1(uint8(0x30 + (n % 10)));
            n /= 10;
        }
        return string(b);
    }
}
