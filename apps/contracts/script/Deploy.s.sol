// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {MoltverseIdentityRegistry} from "../src/MoltverseIdentityRegistry.sol";
import {MoltverseReputationRegistry} from "../src/MoltverseReputationRegistry.sol";
import {MoltverseValidationRegistry} from "../src/MoltverseValidationRegistry.sol";

/// @notice Deploy all three ERC-8004 registries behind UUPS proxies.
///
/// Usage (Anvil local):
///   forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Usage (Base Sepolia testnet):
///   ADMIN=<multisig_addr> \
///   forge script script/Deploy.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
///
/// Environment variables:
///   ADMIN   — address that receives all admin roles (defaults to msg.sender if unset).
///
/// All deployed addresses are logged to stdout; pipe to deployments/<network>.json manually
/// or extend this script to write them via vm.writeJson.
///
/// Spec: _internal/specs/contracts-erc8004.md §11
contract Deploy is Script {
    function run() external {
        address admin = _resolveAdmin();

        vm.startBroadcast();

        // ── IdentityRegistry ──────────────────────────────────────────────
        MoltverseIdentityRegistry identityImpl = new MoltverseIdentityRegistry();
        MoltverseIdentityRegistry identityProxy = MoltverseIdentityRegistry(
            address(
                new ERC1967Proxy(address(identityImpl), abi.encodeCall(MoltverseIdentityRegistry.initialize, (admin)))
            )
        );

        // ── ReputationRegistry ────────────────────────────────────────────
        MoltverseReputationRegistry reputationImpl = new MoltverseReputationRegistry(identityProxy);
        MoltverseReputationRegistry reputationProxy = MoltverseReputationRegistry(
            address(
                new ERC1967Proxy(
                    address(reputationImpl), abi.encodeCall(MoltverseReputationRegistry.initialize, (admin))
                )
            )
        );

        // ── ValidationRegistry ────────────────────────────────────────────
        MoltverseValidationRegistry validationImpl = new MoltverseValidationRegistry(identityProxy);
        MoltverseValidationRegistry validationProxy = MoltverseValidationRegistry(
            address(
                new ERC1967Proxy(
                    address(validationImpl), abi.encodeCall(MoltverseValidationRegistry.initialize, (admin))
                )
            )
        );

        vm.stopBroadcast();

        // ── Log deployed addresses ────────────────────────────────────────
        console.log("=== Moltverse ERC-8004 Deployment ===");
        console.log("Admin:                    ", admin);
        console.log("IdentityRegistry impl:    ", address(identityImpl));
        console.log("IdentityRegistry proxy:   ", address(identityProxy));
        console.log("ReputationRegistry impl:  ", address(reputationImpl));
        console.log("ReputationRegistry proxy: ", address(reputationProxy));
        console.log("ValidationRegistry impl:  ", address(validationImpl));
        console.log("ValidationRegistry proxy: ", address(validationProxy));
        console.log("=====================================");
    }

    /// @dev Returns $ADMIN env var if set, otherwise defaults to the broadcaster's address.
    function _resolveAdmin() private view returns (address) {
        try vm.envAddress("ADMIN") returns (address a) {
            return a;
        } catch {
            return msg.sender;
        }
    }
}
