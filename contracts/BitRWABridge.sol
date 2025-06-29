// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BitRWABridge is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    // Chainlink CCIP
    IRouterClient public immutable ccipRouter;
    uint64 public immutable rootstockChainSelector;
    address public rootstockAdapter;

    // Tokens
    IERC20 public immutable ondoToken;
    address public rOndoToken;

    // Price Feeds
    AggregatorV3Interface public ethToOndoPriceFeed;
    AggregatorV3Interface public rbtcToROndoPriceFeed;

    // Whitelist / Compliance
    mapping(address => bool) public isCompliant;

    // Tracking
    mapping(bytes32 => address) public originalSender;
    mapping(address => uint256) public lockedBalances;
    mapping(address => address) public ethToRootstockAddress;
    mapping(address => address) public bitmaskWalletBindings;

    event AssetLocked(
        address indexed user,
        uint256 ondoAmount,
        uint256 ethValue,
        bytes32 indexed ccipMessageId
    );

    event BridgeCompleted(
        bytes32 indexed originalMessageId,
        address indexed ethereumUser,
        uint256 ondoAmountLocked,
        uint256 ethValueAtLock,
        uint256 rOndoAmountMinted,
        uint256 rbtcValueAtMint
    );

    event ComplianceStatusUpdated(address indexed user, bool isCompliant);
    event WalletBound(address indexed user, address indexed bitmaskWallet);
    event BridgeAttemptFailed(address indexed user, string reason);
    event RootstockAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);

    // Improved Custom Errors with better messages
    error NotCompliant(address user);
    error WalletNotBound(address user);
    error InsufficientTokenBalance(uint256 available, uint256 required);
    error InsufficientTokenAllowance(uint256 available, uint256 required);
    error InsufficientFee(uint256 sent, uint256 required);
    error InvalidWalletAddress();
    error InvalidTokenHolder();
    error ZeroAmount();

    constructor(
        address _ccipRouter,
        uint64 _rootstockSelector,
        address _ondoToken,
        address _ethToOndoPriceFeed,
        address _rootstockAdapter,
        address initialOwner
    ) CCIPReceiver(_ccipRouter) Ownable(initialOwner) {
        require(_ccipRouter != address(0), "Invalid router address");
        require(_ondoToken != address(0), "Invalid token address");
        require(_ethToOndoPriceFeed != address(0), "Invalid price feed address");
        require(_rootstockAdapter != address(0), "Invalid adapter address");
        require(initialOwner != address(0), "Invalid owner address");
        
        ccipRouter = IRouterClient(_ccipRouter);
        rootstockChainSelector = _rootstockSelector;
        ondoToken = IERC20(_ondoToken);
        ethToOndoPriceFeed = AggregatorV3Interface(_ethToOndoPriceFeed);
        rootstockAdapter = _rootstockAdapter;
    }

    modifier onlyCompliant(address user) {
        if (!isCompliant[user]) revert NotCompliant(user);
        _;
    }

    /**
     * @dev Check if a user can successfully bridge tokens
     * @param user The user address
     * @param ondoTokenHolder The address holding the ONDO tokens
     * @param ondoAmount The amount to bridge
     * @return canBridgeResult Whether the user can bridge
     * @return reason Reason if cannot bridge, empty string if can bridge
     */
    function canBridge(
        address user, 
        address ondoTokenHolder, 
        uint256 ondoAmount
    ) public view returns (bool canBridgeResult, string memory reason) {
        if (!isCompliant[user]) {
            return (false, "User not compliant");
        }
        if (bitmaskWalletBindings[user] == address(0)) {
            return (false, "Wallet not bound");
        }
        if (ondoTokenHolder == address(0)) {
            return (false, "Invalid token holder");
        }
        if (ondoAmount == 0) {
            return (false, "Amount must be greater than 0");
        }
        
        uint256 balance = ondoToken.balanceOf(ondoTokenHolder);
        if (balance < ondoAmount) {
            return (false, "Insufficient token balance");
        }
        
        uint256 allowance = ondoToken.allowance(ondoTokenHolder, address(this));
        if (allowance < ondoAmount) {
            return (false, "Insufficient token allowance");
        }
        
        return (true, "All preconditions met");
    }

    /**
     * @dev Get the required fee for bridging
     * @param ondoAmount The amount to bridge
     * @return requiredFee The required fee in wei
     */
    function getRequiredFee(uint256 ondoAmount) public view returns (uint256 requiredFee) {
        address boundWallet = bitmaskWalletBindings[msg.sender];
        if (boundWallet == address(0)) revert WalletNotBound(msg.sender);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(rootstockAdapter),
            data: abi.encode(msg.sender, boundWallet, ondoAmount, 109 * 1e16, true),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 300_000})),
            feeToken: address(0)
        });

        return ccipRouter.getFee(rootstockChainSelector, message);
    }

    /**
     * @dev Bind a Bitmask wallet to the caller
     * @param bitmaskWallet The Bitmask wallet address to bind
     */
    function bindBitmaskWallet(address bitmaskWallet) external {
        if (bitmaskWallet == address(0)) revert InvalidWalletAddress();
        if (!isCompliant[msg.sender]) revert NotCompliant(msg.sender);
        
        bitmaskWalletBindings[msg.sender] = bitmaskWallet;
        emit WalletBound(msg.sender, bitmaskWallet);
    }

    /**
     * @dev Admin function to bind a wallet for a user
     * @param user The user address
     * @param bitmaskWallet The Bitmask wallet address to bind
     */
    function adminBindBitmaskWallet(address user, address bitmaskWallet) external onlyOwner {
        if (user == address(0)) revert InvalidWalletAddress();
        if (bitmaskWallet == address(0)) revert InvalidWalletAddress();
        
        bitmaskWalletBindings[user] = bitmaskWallet;
        emit WalletBound(user, bitmaskWallet);
    }

    /**
     * @dev Admin function to onboard a user (set compliance and bind wallet in one step)
     * @param user The user address
     * @param bitmaskWallet The Bitmask wallet address to bind
     */
    function onboardUser(address user, address bitmaskWallet) external onlyOwner {
        if (user == address(0)) revert InvalidWalletAddress();
        if (bitmaskWallet == address(0)) revert InvalidWalletAddress();
        
        isCompliant[user] = true;
        bitmaskWalletBindings[user] = bitmaskWallet;
        
        emit ComplianceStatusUpdated(user, true);
        emit WalletBound(user, bitmaskWallet);
    }

    /**
     * @dev Lock ONDO tokens and initiate bridge to Rootstock
     * @param ondoAmount The amount of ONDO tokens to bridge
     * @param ondoTokenHolder The address holding the ONDO tokens
     */
    function lockAndBridge(
        uint256 ondoAmount,
        address ondoTokenHolder
    ) external payable onlyCompliant(msg.sender) {
        if (ondoAmount == 0) revert ZeroAmount();
        if (ondoTokenHolder == address(0)) revert InvalidTokenHolder();
        
        // Check wallet binding
        address boundWallet = bitmaskWalletBindings[msg.sender];
        if (boundWallet == address(0)) revert WalletNotBound(msg.sender);

        // Check balance
        uint256 balance = ondoToken.balanceOf(ondoTokenHolder);
        if (balance < ondoAmount) revert InsufficientTokenBalance(balance, ondoAmount);

        // Check allowance
        uint256 allowance = ondoToken.allowance(ondoTokenHolder, address(this));
        if (allowance < ondoAmount) revert InsufficientTokenAllowance(allowance, ondoAmount);

        // Transfer tokens to bridge contract
        ondoToken.safeTransferFrom(ondoTokenHolder, address(this), ondoAmount);
        lockedBalances[msg.sender] += ondoAmount;

        // Construct CCIP message
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(rootstockAdapter),
            data: abi.encode(msg.sender, boundWallet, ondoAmount, 109 * 1e16, true),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 300_000})),
            feeToken: address(0)
        });

        // Check fee
        uint256 requiredFee = ccipRouter.getFee(rootstockChainSelector, message);
        if (msg.value < requiredFee) revert InsufficientFee(msg.value, requiredFee);

        // Execute CCIP bridge
        bytes32 messageId = ccipRouter.ccipSend{value: requiredFee}(
            rootstockChainSelector, 
            message
        );

        originalSender[messageId] = msg.sender;
        emit AssetLocked(msg.sender, ondoAmount, 109 * 1e16, messageId);
    }

    /**
     * @dev Receive CCIP message from Rootstock adapter
     * @param message The CCIP message containing bridge completion data
     */
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        address sender = abi.decode(message.sender, (address));
        require(sender == rootstockAdapter, "Unauthorized sender");
        
        (
            bytes32 originalMessageId,
            uint256 ondoAmountLocked,
            uint256 ethValueAtLock,
            uint256 rOndoAmountMinted,
            uint256 rbtcValueAtMint
        ) = abi.decode(message.data, (bytes32, uint256, uint256, uint256, uint256));

        address user = originalSender[originalMessageId];
        require(user != address(0), "Invalid original sender");

        // Update locked balances
        lockedBalances[user] -= ondoAmountLocked;

        emit BridgeCompleted(
            originalMessageId,
            user,
            ondoAmountLocked,
            ethValueAtLock,
            rOndoAmountMinted,
            rbtcValueAtMint
        );
    }

    // TESTING ONLY: Expose _ccipReceive for tests
    function testCcipReceive(Client.Any2EVMMessage memory message) external {
        _ccipReceive(message);
    }

    // TESTING ONLY: Set originalSender mapping for tests
    function setOriginalSender(bytes32 messageId, address sender) external {
        originalSender[messageId] = sender;
    }

    // Admin functions
    /**
     * @dev Set the rONDO token address
     * @param _rOndoToken The rONDO token address
     */
    function setROndoToken(address _rOndoToken) external onlyOwner {
        require(_rOndoToken != address(0), "Invalid rONDO token address");
        rOndoToken = _rOndoToken;
    }

    /**
     * @dev Set the Rootstock adapter address
     * @param _rootstockAdapter The Rootstock adapter address
     */
    function setRootstockAdapter(address _rootstockAdapter) external onlyOwner {
        require(_rootstockAdapter != address(0), "Invalid adapter address");
        address oldAdapter = rootstockAdapter;
        rootstockAdapter = _rootstockAdapter;
        emit RootstockAdapterUpdated(oldAdapter, _rootstockAdapter);
    }

    /**
     * @dev Set price feed addresses
     * @param _ethToOndoPriceFeed ETH to ONDO price feed address
     * @param _rbtcToROndoPriceFeed RBTC to rONDO price feed address
     */
    function setPriceFeeds(
        address _ethToOndoPriceFeed,
        address _rbtcToROndoPriceFeed
    ) external onlyOwner {
        require(_ethToOndoPriceFeed != address(0), "Invalid ETH price feed");
        require(_rbtcToROndoPriceFeed != address(0), "Invalid RBTC price feed");
        
        ethToOndoPriceFeed = AggregatorV3Interface(_ethToOndoPriceFeed);
        rbtcToROndoPriceFeed = AggregatorV3Interface(_rbtcToROndoPriceFeed);
    }
    
    /**
     * @dev Set compliance status for a user
     * @param user The user address
     * @param approved Whether the user is compliant
     */
    function setCompliance(address user, bool approved) external onlyOwner {
        require(user != address(0), "Invalid user address");
        isCompliant[user] = approved;
        emit ComplianceStatusUpdated(user, approved);
    }

    /**
     * @dev Get user's bridge status
     * @param user The user address
     * @return compliant Whether the user is compliant
     * @return boundWallet The user's bound Bitmask wallet
     * @return lockedAmount The user's locked ONDO amount
     */
    function getUserStatus(address user) external view returns (
        bool compliant,
        address boundWallet,
        uint256 lockedAmount
    ) {
        return (
            isCompliant[user],
            bitmaskWalletBindings[user],
            lockedBalances[user]
        );
    }

    /**
     * @dev Emergency function to withdraw stuck tokens (owner only)
     * @param token The token address to withdraw
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Emergency function to withdraw stuck ETH (owner only)
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function emergencyWithdrawETH(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(amount <= address(this).balance, "Insufficient balance");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    receive() external payable {}
}