// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IRouterClient } from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import { AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { Client } from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IRWAHub } from "./interfaces/IRWAHub.sol"; 

contract BitRWABridge is Ownable {
    using SafeERC20 for IERC20;

    // Chainlink CCIP
    IRouterClient public immutable ccipRouter;
    uint64 public immutable rootstockChainSelector;
    address public immutable destinationBridgeAdapter;

    // Ondo RWA Token
    IERC20 public immutable ondoRWAToken;

    // Chainlink Price Feed
    AggregatorV3Interface public priceFeed;

    // RWA Hub (for mint requests)
    IRWAHub public rwaHub;

    // Wallet Bindings (user => bitmask wallet)
    mapping(address => address) public bitmaskWalletBindings;

    // Whitelist / Compliance (user => KYC/AML approved)
    mapping(address => bool) public isCompliant;

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

    event ComplianceStatusUpdated(address indexed user, bool isCompliant);
    event WalletBound(address indexed user, address indexed bitmaskWallet);

    // Custom errors for better debugging
    error InsufficientFeeTokenAmount();
    error InvalidAmount();
    error WalletNotBound();
    error UserNotCompliant();

    constructor(
        address _ccipRouter,
        uint64 _rootstockSelector,
        address _ondoRWAToken,
        address _priceFeed,
        address _rwaHub,
        address _destinationBridgeAdapter,
        address initialOwner
    ) Ownable(initialOwner) {
        ccipRouter = IRouterClient(_ccipRouter);
        rootstockChainSelector = _rootstockSelector;
        ondoRWAToken = IERC20(_ondoRWAToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
        rwaHub = IRWAHub(_rwaHub);
        destinationBridgeAdapter = _destinationBridgeAdapter;
    }

    modifier onlyCompliant(address user) {
        if (!isCompliant[user]) revert UserNotCompliant();
        _;
    }

    function lockAndBridge(
        uint256 amount,
        address bitmaskWallet
    ) external payable onlyCompliant(msg.sender) {
        if (bitmaskWalletBindings[msg.sender] != bitmaskWallet) revert WalletNotBound();
        if (amount == 0) revert InvalidAmount();

        // Transfer RWA tokens to this contract
        ondoRWAToken.safeTransferFrom(msg.sender, address(this), amount);

        // Request mint via RWAHub
        rwaHub.requestSubscription(amount);

        // Fetch price
        (, int256 price,,,) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price feed");
        uint256 normalizedPrice = uint256(price) * 1e10;

        // Construct CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationBridgeAdapter),
            data: abi.encode(msg.sender, bitmaskWallet, amount, normalizedPrice, true),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 400_000}) // Explicit gas limit
            ),
            feeToken: address(0) // Native token (ETH) for fees
        });

        uint256 fee = ccipRouter.getFee(rootstockChainSelector, message);
        if (msg.value < fee) revert InsufficientFeeTokenAmount();

        bytes32 messageId = ccipRouter.ccipSend{value: fee}(rootstockChainSelector, message);
        
        // Refund excess fee
        if (msg.value > fee) {
            payable(msg.sender).transfer(msg.value - fee);
        }
        
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
        require(bitmaskWallet != address(0), "Invalid wallet");
        bitmaskWalletBindings[msg.sender] = bitmaskWallet;
        emit WalletBound(msg.sender, bitmaskWallet);
    }

    function setCompliance(address user, bool approved) external onlyOwner {
        isCompliant[user] = approved;
        emit ComplianceStatusUpdated(user, approved);
    }

    function setRwaHub(address _rwaHub) external onlyOwner {
        require(_rwaHub != address(0), "Invalid RWAHub");
        rwaHub = IRWAHub(_rwaHub);
    }

    function checkAllowance(address user) external view returns (uint256) {
        return ondoRWAToken.allowance(user, address(this));
    }

    // Helper function to estimate fees
    function estimateFee(
        uint256 amount,
        address bitmaskWallet,
        address ethUser
    ) external view returns (uint256) {
        (, int256 price,,,) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price feed");
        uint256 normalizedPrice = uint256(price) * 1e10;

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(destinationBridgeAdapter),
            data: abi.encode(ethUser, bitmaskWallet, amount, normalizedPrice, true),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 400_000})
            ),
            feeToken: address(0)
        });

        return ccipRouter.getFee(rootstockChainSelector, message);
    }
}