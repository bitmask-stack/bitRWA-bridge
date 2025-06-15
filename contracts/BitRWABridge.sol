// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BitRWABridge {
    using SafeERC20 for IERC20;
    
    // Chainlink CCIP
    IRouterClient public immutable ccipRouter; //0xCe7aFb0BF5F73BfDB5e9E04976eBac2005746bD0
    uint64 public immutable rootstockChainSelector; //11964252391146578476
    
    // Ondo RWA Token
    IERC20 public immutable ondoRWAToken;
    
    // Chainlink Price Feed
    AggregatorV3Interface public priceFeed;
    
    // BitMask Wallet Registry
    mapping(address => address) public bitmaskWalletBindings;
    
    event AssetLocked(
        address indexed user,
        uint256 amount,
        bytes32 indexed ccipMessageId
    );
    
    event BridgeCompleted(
        bytes32 indexed ccipMessageId,
        address indexed bitmaskWallet,
        uint256 mintedAmount
    );

    constructor(
        address _ccipRouter,
        uint64 _rootstockSelector,
        address _ondoRWAToken,
        address _priceFeed
    ) {
        ccipRouter = IRouterClient(_ccipRouter);
        rootstockChainSelector = _rootstockSelector;
        ondoRWAToken = IERC20(_ondoRWAToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function lockAndBridge(
        uint256 amount,
        address bitmaskWallet
    ) external payable {
        // 1. Verify user has bound this BitMask wallet
        require(
            bitmaskWalletBindings[msg.sender] == bitmaskWallet,
            "Wallet not bound"
        );
        
        // 2. Transfer RWA tokens from user
        ondoRWAToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // 3. Get current asset price
        (, int256 price,,,) = priceFeed.latestRoundData();
        uint256 normalizedPrice = uint256(price) * (10**10); // Adjust for decimals
        
        // 4. Prepare CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(address(0)), // Factory address will be set in adapter
            data: abi.encode(msg.sender, bitmaskWallet, amount, normalizedPrice),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: "",
            feeToken: address(0)
        });
        
        // 5. Send cross-chain message
        uint256 fee = ccipRouter.getFee(rootstockChainSelector, message);
        require(msg.value >= fee, "Insufficient CCIP fee");
        bytes32 messageId = ccipRouter.ccipSend{value: fee}(rootstockChainSelector, message);
        
        emit AssetLocked(msg.sender, amount, messageId);
    }

    function completeBridge(
        bytes32 originalMessageId,
        address bitmaskWallet,
        uint256 mintedAmount
    ) external onlyOwner {
        emit BridgeCompleted(originalMessageId, bitmaskWallet, mintedAmount);
    }

    function bindBitmaskWallet(address bitmaskWallet) external {
        bitmaskWalletBindings[msg.sender] = bitmaskWallet;
    }
}