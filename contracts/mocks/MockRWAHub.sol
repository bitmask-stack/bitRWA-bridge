// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IRWAHub } from "../interfaces/IRWAHub.sol";

contract MockRWAHub is IRWAHub {
    // Event specific to your mock's internal logic, not from the interface
    event SubscriptionCompleted(bytes32 subscriptionId);
    event MockRequestSubscription(uint256 amount); // Renamed for clarity in test

    // --- Required implementations from IRWAHub interface ---

    function requestSubscription(uint256 amount) external {
        // Your BitRWABridge calls this. Emit an event for testing.
        emit MockRequestSubscription(amount);
    }

    function claimMint(bytes32[] calldata depositIds) external {
        // Minimal implementation required by interface
    }

    function requestRedemption(uint256 amount) external {
        // Minimal implementation required by interface
    }

    function claimRedemption(bytes32[] calldata redemptionIds) external {
        // Minimal implementation required by interface
    }

    function addProof(
        bytes32 txHash,
        address user,
        uint256 depositAmountAfterFee,
        uint256 feeAmount,
        uint256 timestamp
    ) external {
        // Minimal implementation required by interface
    }

    function setPriceIdForDeposits(
        bytes32[] calldata depositIds,
        uint256[] calldata priceIds
    ) external {
        // Minimal implementation required by interface
    }

    function setPriceIdForRedemptions(
        bytes32[] calldata redemptionIds,
        uint256[] calldata priceIds
    ) external {
        // Minimal implementation required by interface
    }

    function setPricer(address newPricer) external {
        // Minimal implementation required by interface
    }

    function overwriteDepositor(
        bytes32 depositIdToOverride,
        address user,
        uint256 depositAmountAfterFee,
        uint256 priceId
    ) external {
        // Minimal implementation required by interface
    }

    function overwriteRedeemer(
        bytes32 redemptionIdToOverride,
        address user,
        uint256 rwaTokenAmountBurned,
        uint256 priceId
    ) external {
        // Minimal implementation required by interface
    }

    // --- Your custom mock functions (if any) that are NOT from the interface ---
    // If your test calls this, keep it. Otherwise, you might remove it.
    function completeSubscription(bytes32 subscriptionId) external {
        emit SubscriptionCompleted(subscriptionId);
    }

    
}