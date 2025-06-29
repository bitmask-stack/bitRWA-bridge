// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract BitRWABridgeAdapter is CCIPReceiver, Ownable {
    // Contracts
    IMintableERC20 public immutable rOndoToken;
    address public ethereumBridge;
    uint256 public immutable ethereumChainSelector;

    // Price Feed (rOndo/RBTC)
    AggregatorV3Interface public rOndoPriceFeed;
    
    // Price Tracking
    struct MintData {
        uint256 rOndoAmount;
        uint256 rbtcValue; // Value in RBTC (e.g., 1 rOndo = 0.001 RBTC)
        uint256 timestamp;
        address ethereumUser;
        address bitmaskWallet;
    }
    mapping(bytes32 => MintData) public mintRecords;

    event TokensMinted(
        address indexed bitmaskWallet,
        uint256 rOndoAmount,
        uint256 rbtcValue,
        bytes32 indexed messageId,
        address indexed ethereumUser
    );

    event ConfirmationSent(
        bytes32 indexed originalMessageId,
        address indexed ethereumUser,
        uint256 amountLocked,
        uint256 rOndoMinted,
        uint256 rbtcValueAtMint
    );

    error UnauthorizedSender();
    error InvalidAmount();
    error PriceFeedError();
    error MintingFailed();

    constructor(
        address _ccipRouter,
        address _rOndoToken,
        address _rOndoPriceFeed, // rUSDY/RBTC price feed
        address _ethereumBridge,
        uint256 _ethereumChainSelector,
        address initialOwner
    ) CCIPReceiver(_ccipRouter) Ownable(initialOwner) {
        require(_rOndoToken != address(0), "Invalid rUSDY token address");
        require(_rOndoPriceFeed != address(0), "Invalid price feed address");
        require(_ethereumBridge != address(0), "Invalid bridge address");
        require(initialOwner != address(0), "Invalid owner address");
        
        rOndoToken = IMintableERC20(_rOndoToken);
        rOndoPriceFeed = AggregatorV3Interface(_rOndoPriceFeed);
        ethereumBridge = _ethereumBridge;
        ethereumChainSelector = _ethereumChainSelector;
    }

    // =========================
    // Price Calculation (rOndo/RBTC)
    // =========================
    function getROndoToRbtcValue(uint256 rOndoAmount) public view returns (uint256) {
        (, int256 price,,,) = rOndoPriceFeed.latestRoundData();
        if (price <= 0) revert PriceFeedError();
        return (rOndoAmount * uint256(price)) / 1e18; // Both rUSDY and RBTC use 18 decimals
    }

    // =========================
    // Cross-Chain Minting
    // =========================
    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        // 1. Validate sender
        address sender = abi.decode(message.sender, (address));
        if (sender != ethereumBridge) revert UnauthorizedSender();

        // 2. Decode payload from Ethereum
        (
            address ethUser,
            address bitmaskWallet,
            uint256 ondoAmountLocked,
            uint256 ethValueAtLock,
            bool sendConfirmation
        ) = abi.decode(message.data, (address, address, uint256, uint256, bool));

        // 3. Validate inputs
        if (ethUser == address(0) || bitmaskWallet == address(0)) revert UnauthorizedSender();
        if (ondoAmountLocked == 0) revert InvalidAmount();

        // 4. Calculate rOndo mint amount (1:1 for example)
        uint256 rOndoAmount = ondoAmountLocked; // Adjust if conversion rate differs
        uint256 rbtcValue = getROndoToRbtcValue(rOndoAmount);

        // 5. Mint rOndo tokens
        try rOndoToken.mint(bitmaskWallet, rOndoAmount) {
            // Minting successful
        } catch {
            revert MintingFailed();
        }

        // 6. Store mint data for frontend
        mintRecords[message.messageId] = MintData({
            rOndoAmount: rOndoAmount,
            rbtcValue: rbtcValue,
            timestamp: block.timestamp,
            ethereumUser: ethUser,
            bitmaskWallet: bitmaskWallet
        });

        emit TokensMinted(bitmaskWallet, rOndoAmount, rbtcValue, message.messageId, ethUser);

        // 7. Send confirmation back to Ethereum (with correct data structure)
        if (sendConfirmation) {
            Client.EVM2AnyMessage memory confirmation = Client.EVM2AnyMessage({
                receiver: abi.encode(ethereumBridge),
                data: abi.encode(
                    message.messageId, // This is the original message ID from Ethereum
                    ondoAmountLocked,
                    ethValueAtLock,
                    rOndoAmount,
                    rbtcValue
                ),
                tokenAmounts: new Client.EVMTokenAmount[](0),
                extraArgs: Client._argsToBytes(Client.EVMExtraArgsV1({gasLimit: 300_000})),
                feeToken: address(0)
            });

            IRouterClient(getRouter()).ccipSend(
                uint64(ethereumChainSelector),
                confirmation
            );

            emit ConfirmationSent(
                message.messageId,
                ethUser,
                ondoAmountLocked,
                rOndoAmount,
                rbtcValue
            );
        }
    }

    // =========================
    // View Functions
    // =========================
    function getMintData(bytes32 messageId) external view returns (MintData memory) {
        return mintRecords[messageId];
    }

    function getROndoBalance(address user) external view returns (uint256) {
        return rOndoToken.balanceOf(user);
    }

    // =========================
    // Admin Functions
    // =========================
    function setEthereumBridge(address newBridge) external onlyOwner {
        require(newBridge != address(0), "Invalid address");
        ethereumBridge = newBridge;
    }

    function setROndoPriceFeed(address newFeed) external onlyOwner {
        require(newFeed != address(0), "Invalid price feed address");
        rOndoPriceFeed = AggregatorV3Interface(newFeed);
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
        
        IERC20(token).transfer(to, amount);
    }

    /**
     * @dev Emergency function to withdraw stuck RBTC (owner only)
     * @param to The recipient address
     * @param amount The amount to withdraw
     */
    function emergencyWithdrawRBTC(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(amount <= address(this).balance, "Insufficient balance");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "tRBTC transfer failed");
    }

    // TESTING ONLY: Expose _ccipReceive for tests
    function testCcipReceive(Client.Any2EVMMessage memory message) external {
        _ccipReceive(message);
    }

    receive() external payable {}
} 