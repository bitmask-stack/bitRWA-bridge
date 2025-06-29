// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

contract MockRouter is IRouterClient {
  event MessageSent(
        bytes32 indexed messageId,
        uint64 destinationChainSelector,
        address sender,
        bytes receiver,
        bytes data
    );

    
    
    function getFee(uint64, Client.EVM2AnyMessage memory) external pure returns (uint256) {
        return 0.01 ether;
    }

  function ccipSend(uint64 destinationChainSelector, Client.EVM2AnyMessage calldata message) 
        external 
        payable 
        override 
        returns (bytes32) 
    {
        bytes32 messageId = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        emit MessageSent(
            messageId,
            destinationChainSelector,
            msg.sender,
            message.receiver,
            message.data
        );
        return messageId;
    }

    
    // Minimal interface implementation
    function getSupportedTokens(uint64) external pure returns (address[] memory) {
        return new address[](0);
    }
    
    function isChainSupported(uint64) external pure returns (bool) {
        return true;
    }
    
    function getOffRamps() external pure returns (OffRamp[] memory) {
        return new OffRamp[](0);
    }
    
    function getOnRamps() external pure returns (OnRamp[] memory) {
        return new OnRamp[](0);
    }
    
    // Dummy structs to satisfy interface
    struct OffRamp {
        bytes32 sourceChainSelector;
        address offRamp;
    }
    
    struct OnRamp {
        bytes32 destChainSelector;
        address onRamp;
    }


struct FeeTokenConfig {
    uint64 networkFeeAmount;
    uint32 gasMultiplierWeiPerEth;
    uint32 premiumMultiplierWeiPerEth;
    bool enabled;
}
function getFeeTokenConfig(address) external pure returns (FeeTokenConfig memory) {
    return FeeTokenConfig({
        networkFeeAmount: 0,
        gasMultiplierWeiPerEth: 0,
        premiumMultiplierWeiPerEth: 0,
        enabled: false
    });
}


}