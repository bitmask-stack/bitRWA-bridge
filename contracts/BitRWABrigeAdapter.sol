// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { CCIPReceiver, Client } from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import { IRouterClient } from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract BitRWABridgeAdapter is CCIPReceiver {
    IMintableERC20 public immutable rRWAToken;
    AggregatorV3Interface public priceFeed;
    address public immutable ethereumBridge;

    event rRWAMinted(
        address indexed bitmaskWallet,
        uint256 amount,
        uint256 rskPrice
    );

    event MessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        address ethUser,
        address bitmaskWallet,
        uint256 amount,
        uint256 ethPrice
    );

    constructor(
        address _ccipRouter,
        address _rRWAToken,
        address _priceFeed,
        address _ethereumBridge
    ) CCIPReceiver(_ccipRouter) {
        require(_ccipRouter != address(0), "Invalid router");
        require(_rRWAToken != address(0), "Invalid token");
        require(_priceFeed != address(0), "Invalid price feed");
        require(_ethereumBridge != address(0), "Invalid Ethereum bridge");

        rRWAToken = IMintableERC20(_rRWAToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
        ethereumBridge = _ethereumBridge;
    }

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        // Ensure message is from the Ethereum bridge
        require(message.sender.length == 32, "Invalid sender payload");
        address sender = abi.decode(message.sender, (address));
        require(sender == ethereumBridge, "Unauthorized sender");

        // Decode the payload sent from Ethereum
        (address ethUser, address bitmaskWallet, uint256 amount, uint256 ethPrice) =
            abi.decode(message.data, (address, address, uint256, uint256));

        emit MessageReceived(
            message.messageId,
            message.sourceChainSelector,
            sender,
            ethUser,
            bitmaskWallet,
            amount,
            ethPrice
        );

        // Fetch latest RSK price
        (, int256 rskPrice,,,) = priceFeed.latestRoundData();
        require(rskPrice > 0, "Invalid RSK price");
        uint256 normalizedRskPrice = uint256(rskPrice) * 1e10;

        // Calculate how many rRWA tokens to mint
        uint256 mintAmount = (amount * ethPrice) / normalizedRskPrice;

        // Mint tokens to user's bound Bitmask wallet
        rRWAToken.mint(bitmaskWallet, mintAmount);

        emit rRWAMinted(bitmaskWallet, mintAmount, normalizedRskPrice);

        // Optional: confirmation callback
        if (message.extraArgs.length > 0) {
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

        IRouterClient(getRouter()).ccipSend(sourceChainSelector, message);
    }

    // View function to simulate CCIP message processing (for testing)
    function simulateReceive(
        address ethUser,
        address bitmaskWallet,
        uint256 amount,
        uint256 ethPrice
    ) external view returns (uint256 mintAmount) {
        (, int256 rskPrice,,,) = priceFeed.latestRoundData();
        require(rskPrice > 0, "Invalid RSK price");
        uint256 normalizedRskPrice = uint256(rskPrice) * 1e10;
        mintAmount = (amount * ethPrice) / normalizedRskPrice;
        return mintAmount;
    }
}