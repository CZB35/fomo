// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AIFomoKingNative} from "../src/AIFomoKingNative.sol";

contract DeployNative is Script {
    function run() external {
        address devWallet = vm.envAddress("DEV_WALLET");
        uint256 entranceFee = vm.envOr("ENTRANCE_FEE", uint256(1000000000000000)); // 0.001 BNB = 1e15 wei
        uint256 devEntryBps = vm.envOr("DEV_ENTRY_BPS", uint256(1000));
        uint256 referralBps = vm.envOr("REFERRAL_BPS", uint256(500));
        uint256 roundDuration = vm.envOr("ROUND_DURATION", uint256(900));
        uint256 winFeeBps = vm.envOr("WIN_FEE_BPS", uint256(500));

        vm.startBroadcast();
        AIFomoKingNative deployed = new AIFomoKingNative(devWallet, entranceFee, devEntryBps, referralBps, roundDuration, winFeeBps);
        vm.stopBroadcast();

        console2.log("AIFomoKingNative deployed at:", address(deployed));
    }
}
