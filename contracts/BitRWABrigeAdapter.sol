// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract bitRWABridgeAdapter is CCIPReceiver {
    // rRWA Token
    ERC20 public immutable rRWAToken;
    
    // Price Feed
    AggregatorV3Interface public priceFeed;
    
    // Ethereum Bridge
    address public immutable ethereumBridge;
    
    event rRWAMinted(
        address indexed bitmaskWallet,
        uint256 amount,
        uint256 priceAtBridge
    );

    constructor(
        address _ccipRouter,
        address _rRWAToken,
        address _priceFeed,
        address _ethereumBridge
    ) CCIPReceiver(_ccipRouter) {
        rRWAToken = ERC20(_rRWAToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
        ethereumBridge = _ethereumBridge;
    }

    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // 1. Verify message comes from Ethereum bridge
        require(message.sender == abi.decode(message.extraArgs, (address)), "Unauthorized sender");
        
        // 2. Decode payload
        (address ethUser, address bitmaskWallet, uint256 amount, uint256 ethPrice) = 
            abi.decode(message.data, (address, address, uint256, uint256));
        
        // 3. Get current Rootstock price
        (, int256 rskPrice,,,) = priceFeed.latestRoundData();
        uint256 normalizedRskPrice = uint256(rskPrice) * (10**10);
        
        // 4. Calculate mint amount with price adjustment
        uint256 mintAmount = (amount * ethPrice) / normalizedRskPrice;
        
        // 5. Mint rRWA tokens
        rRWAToken.mint(bitmaskWallet, mintAmount);
        
        // 6. Emit completion event
        emit rRWAMinted(bitmaskWallet, mintAmount, normalizedRskPrice);
        
        // 7. Send confirmation back to Ethereum (optional)
        if(message.extraArgs.length > 0) {
            _sendConfirmation(message.sourceChainSelector, message.messageId, bitmaskWallet, mintAmount);
        }
    }
    
    function _sendConfirmation(
        uint64 sourceChainSelector,
        bytes32 originalMessageId,
        address bitmaskWallet,
        uint256 mintedAmount
    ) internal {
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(ethereumBridge),
            data: abi.encode(originalMessageId, bitmaskWallet, mintedAmount),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: "",
            feeToken: address(0)
        });
        
        ccipRouter.ccipSend(sourceChainSelector, message);
    }
}

