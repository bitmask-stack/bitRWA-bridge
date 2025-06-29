// Sources flattened with hardhat v2.24.3 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @chainlink/contracts-ccip/contracts/libraries/Client.sol@v1.6.0

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.0;

// End consumer library.
library Client {
  /// @dev RMN depends on this struct, if changing, please notify the RMN maintainers.
  struct EVMTokenAmount {
    address token; // token address on the local chain.
    uint256 amount; // Amount of tokens.
  }

  struct Any2EVMMessage {
    bytes32 messageId; // MessageId corresponding to ccipSend on source.
    uint64 sourceChainSelector; // Source chain selector.
    bytes sender; // abi.decode(sender) if coming from an EVM chain.
    bytes data; // payload sent in original message.
    EVMTokenAmount[] destTokenAmounts; // Tokens and their amounts in their destination chain representation.
  }

  // If extraArgs is empty bytes, the default is 200k gas limit.
  struct EVM2AnyMessage {
    bytes receiver; // abi.encode(receiver address) for dest EVM chains.
    bytes data; // Data payload.
    EVMTokenAmount[] tokenAmounts; // Token transfers.
    address feeToken; // Address of feeToken. address(0) means you will send msg.value.
    bytes extraArgs; // Populate this with _argsToBytes(EVMExtraArgsV2).
  }

  // Tag to indicate only a gas limit. Only usable for EVM as destination chain.
  bytes4 public constant EVM_EXTRA_ARGS_V1_TAG = 0x97a657c9;

  struct EVMExtraArgsV1 {
    uint256 gasLimit;
  }

  function _argsToBytes(
    EVMExtraArgsV1 memory extraArgs
  ) internal pure returns (bytes memory bts) {
    return abi.encodeWithSelector(EVM_EXTRA_ARGS_V1_TAG, extraArgs);
  }

  // Tag to indicate a gas limit (or dest chain equivalent processing units) and Out Of Order Execution. This tag is
  // available for multiple chain families. If there is no chain family specific tag, this is the default available
  // for a chain.
  // Note: not available for Solana VM based chains.
  bytes4 public constant GENERIC_EXTRA_ARGS_V2_TAG = 0x181dcf10;

  /// @param gasLimit: gas limit for the callback on the destination chain.
  /// @param allowOutOfOrderExecution: if true, it indicates that the message can be executed in any order relative to
  /// other messages from the same sender. This value's default varies by chain. On some chains, a particular value is
  /// enforced, meaning if the expected value is not set, the message request will revert.
  /// @dev Fully compatible with the previously existing EVMExtraArgsV2.
  struct GenericExtraArgsV2 {
    uint256 gasLimit;
    bool allowOutOfOrderExecution;
  }

  // Extra args tag for chains that use the Solana VM.
  bytes4 public constant SVM_EXTRA_ARGS_V1_TAG = 0x1f3b3aba;

  struct SVMExtraArgsV1 {
    uint32 computeUnits;
    uint64 accountIsWritableBitmap;
    bool allowOutOfOrderExecution;
    bytes32 tokenReceiver;
    // Additional accounts needed for execution of CCIP receiver. Must be empty if message.receiver is zero.
    // Token transfer related accounts are specified in the token pool lookup table on SVM.
    bytes32[] accounts;
  }

  /// @dev The maximum number of accounts that can be passed in SVMExtraArgs.
  uint256 public constant SVM_EXTRA_ARGS_MAX_ACCOUNTS = 64;

  /// @dev The expected static payload size of a token transfer when Borsh encoded and submitted to SVM.
  /// TokenPool extra data and offchain data sizes are dynamic, and should be accounted for separately.
  uint256 public constant SVM_TOKEN_TRANSFER_DATA_OVERHEAD = (4 + 32) // source_pool
    + 32 // token_address
    + 4 // gas_amount
    + 4 // extra_data overhead
    + 32 // amount
    + 32 // size of the token lookup table account
    + 32 // token-related accounts in the lookup table, over-estimated to 32, typically between 11 - 13
    + 32 // token account belonging to the token receiver, e.g ATA, not included in the token lookup table
    + 32 // per-chain token pool config, not included in the token lookup table
    + 32 // per-chain token billing config, not always included in the token lookup table
    + 32; // OffRamp pool signer PDA, not included in the token lookup table

  /// @dev Number of overhead accounts needed for message execution on SVM.
  /// @dev These are message.receiver, and the OffRamp Signer PDA specific to the receiver.
  uint256 public constant SVM_MESSAGING_ACCOUNTS_OVERHEAD = 2;

  /// @dev The size of each SVM account address in bytes.
  uint256 public constant SVM_ACCOUNT_BYTE_SIZE = 32;

  function _argsToBytes(
    GenericExtraArgsV2 memory extraArgs
  ) internal pure returns (bytes memory bts) {
    return abi.encodeWithSelector(GENERIC_EXTRA_ARGS_V2_TAG, extraArgs);
  }

  function _svmArgsToBytes(
    SVMExtraArgsV1 memory extraArgs
  ) internal pure returns (bytes memory bts) {
    return abi.encodeWithSelector(SVM_EXTRA_ARGS_V1_TAG, extraArgs);
  }
}


// File @chainlink/contracts-ccip/contracts/interfaces/IAny2EVMMessageReceiver.sol@v1.6.0

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.0;

/// @notice Application contracts that intend to receive messages from  the router should implement this interface.
interface IAny2EVMMessageReceiver {
  /// @notice Called by the Router to deliver a message. If this reverts, any token transfers also revert.
  /// The message will move to a FAILED state and become available for manual execution.
  /// @param message CCIP Message.
  /// @dev Note ensure you check the msg.sender is the OffRampRouter.
  function ccipReceive(
    Client.Any2EVMMessage calldata message
  ) external;
}


// File @chainlink/contracts/src/v0.8/vendor/openzeppelin-solidity/v5.0.2/contracts/utils/introspection/IERC165.sol@v1.4.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/introspection/IERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[EIP].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol@v1.6.0

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.4;

/// @title CCIPReceiver - Base contract for CCIP applications that can receive messages.
abstract contract CCIPReceiver is IAny2EVMMessageReceiver, IERC165 {
  address internal immutable i_ccipRouter;

  constructor(
    address router
  ) {
    if (router == address(0)) revert InvalidRouter(address(0));
    i_ccipRouter = router;
  }

  /// @notice IERC165 supports an interfaceId.
  /// @param interfaceId The interfaceId to check.
  /// @return true if the interfaceId is supported.
  /// @dev Should indicate whether the contract implements IAny2EVMMessageReceiver.
  /// e.g. return interfaceId == type(IAny2EVMMessageReceiver).interfaceId || interfaceId == type(IERC165).interfaceId
  /// This allows CCIP to check if ccipReceive is available before calling it.
  /// - If this returns false or reverts, only tokens are transferred to the receiver.
  /// - If this returns true, tokens are transferred and ccipReceive is called atomically.
  /// Additionally, if the receiver address does not have code associated with it at the time of
  /// execution (EXTCODESIZE returns 0), only tokens will be transferred.
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override returns (bool) {
    return interfaceId == type(IAny2EVMMessageReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
  }

  /// @inheritdoc IAny2EVMMessageReceiver
  function ccipReceive(
    Client.Any2EVMMessage calldata message
  ) external virtual override onlyRouter {
    _ccipReceive(message);
  }

  /// @notice Override this function in your implementation.
  /// @param message Any2EVMMessage.
  function _ccipReceive(
    Client.Any2EVMMessage memory message
  ) internal virtual;

  /// @notice Return the current router
  /// @return CCIP router address
  function getRouter() public view virtual returns (address) {
    return address(i_ccipRouter);
  }

  error InvalidRouter(address router);

  /// @dev only calls from the set router are accepted.
  modifier onlyRouter() {
    if (msg.sender != getRouter()) revert InvalidRouter(msg.sender);
    _;
  }
}


// File @chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol@v1.6.0

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.4;

interface IRouterClient {
  error UnsupportedDestinationChain(uint64 destChainSelector);
  error InsufficientFeeTokenAmount();
  error InvalidMsgValue();

  /// @notice Checks if the given chain ID is supported for sending/receiving.
  /// @param destChainSelector The chain to check.
  /// @return supported is true if it is supported, false if not.
  function isChainSupported(
    uint64 destChainSelector
  ) external view returns (bool supported);

  /// @param destinationChainSelector The destination chainSelector.
  /// @param message The cross-chain CCIP message including data and/or tokens.
  /// @return fee returns execution fee for the message.
  /// delivery to destination chain, denominated in the feeToken specified in the message.
  /// @dev Reverts with appropriate reason upon invalid message.
  function getFee(
    uint64 destinationChainSelector,
    Client.EVM2AnyMessage memory message
  ) external view returns (uint256 fee);

  /// @notice Request a message to be sent to the destination chain.
  /// @param destinationChainSelector The destination chain ID.
  /// @param message The cross-chain CCIP message including data and/or tokens.
  /// @return messageId The message ID.
  /// @dev Note if msg.value is larger than the required fee (from getFee) we accept.
  /// the overpayment with no refund.
  /// @dev Reverts with appropriate reason upon invalid message.
  function ccipSend(
    uint64 destinationChainSelector,
    Client.EVM2AnyMessage calldata message
  ) external payable returns (bytes32);
}


// File @chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol@v1.4.0

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.0;

// solhint-disable-next-line interface-starts-with-i
interface AggregatorV3Interface {
  function decimals() external view returns (uint8);

  function description() external view returns (string memory);

  function version() external view returns (uint256);

  function getRoundData(
    uint80 _roundId
  ) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

  function latestRoundData()
    external
    view
    returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.3.0

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File contracts/BitRWABrigeAdapter.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.28;





interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract BitRWABridgeAdapter is CCIPReceiver {
    IMintableERC20 public immutable rRWAToken;
    AggregatorV3Interface public priceFeed;
    address public ethereumBridge;
    
    // For testing purposes
    address private testRouter;

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

    error DebugRevert(string message);
    error UnauthorizedSenderFromRouter(address actualSender, address expectedSender);
    error InvalidPriceFeed();
    error ZeroMintAmount();

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
        // Check if we're in test environment
        bool isTestEnvironment = (block.chainid == 31337 || block.chainid == 313370);
        
        if (isTestEnvironment) {
            // In test environment, allow bypass of router validation
            _processMessage(message);
            return;
        }
        
        // Production validation
        require(msg.sender == address(getRouter()), "Only router can call");
        
        if (message.sender.length != 32) {
            revert DebugRevert("Invalid sender payload length");
        }
        
        address sender = abi.decode(message.sender, (address));
        if (sender != ethereumBridge) {
            revert UnauthorizedSenderFromRouter(sender, ethereumBridge);
        }
        
        _processMessage(message);
    }

    function _processMessage(Client.Any2EVMMessage memory message) internal {
        (address ethUser, address bitmaskWallet, uint256 amount, uint256 ethPrice, bool sendConfirmation) =
            abi.decode(message.data, (address, address, uint256, uint256, bool));
        
        emit MessageReceived(
            message.messageId,
            message.sourceChainSelector,
            abi.decode(message.sender, (address)),
            ethUser,
            bitmaskWallet,
            amount,
            ethPrice
        );
        
        // Price feed check
        (, int256 rskPrice,,,) = priceFeed.latestRoundData();
        if (rskPrice <= 0) revert InvalidPriceFeed();
        
        uint256 normalizedRskPrice = uint256(rskPrice) * 1e10;
        
        // Calculate mint amount
        uint256 mintAmount = (amount * ethPrice) / normalizedRskPrice;
        if (mintAmount == 0) revert ZeroMintAmount();
        
        // Mint tokens
        rRWAToken.mint(bitmaskWallet, mintAmount);
        
        // Emit events
        emit rRWAMinted(bitmaskWallet, mintAmount, normalizedRskPrice);
        
        if (sendConfirmation) {
            _sendConfirmation(
                message.sourceChainSelector,
                message.messageId,
                bitmaskWallet,
                mintAmount
            );
        }
    }

    function _sendConfirmation(
        uint64 sourceChainSelector,
        bytes32 originalMessageId,
        address bitmaskWallet,
        uint256 mintedAmount
    ) internal {
        // Skip confirmation sending in test environment
        if (block.chainid == 31337 || block.chainid == 313370) {
            return;
        }
        
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(ethereumBridge),
            data: abi.encode(originalMessageId, bitmaskWallet, mintedAmount),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: "",
            feeToken: address(0)
        });

        IRouterClient(getRouter()).ccipSend(sourceChainSelector, message);
    }

    // Test helper functions
    function simulateCCIPReceiveForTest(
        bytes32 messageId,
        uint64 sourceChainSelector,
        address sender,
        bytes memory data
    ) external {
        // Only allow in test environments
        require(
            block.chainid == 31337 || block.chainid == 313370, 
            "Test only function"
        );
        
        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: sourceChainSelector,
            sender: abi.encode(sender),
            data: data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
        
        _ccipReceive(message);
    }

    function setRouterForTest(address newRouter) external {
        // Allow in test environments
        require(
            block.chainid == 31337 || block.chainid == 313370, 
            "Test only function"
        );
        testRouter = newRouter;
    }

    // Override getRouter for test environments
    function getRouter() public view override returns (address) {
        if ((block.chainid == 31337 || block.chainid == 313370) && testRouter != address(0)) {
            return testRouter;
        }
        return super.getRouter();
    }

    function setEthereumBridge(address _newBridge) external {
        require(_newBridge != address(0), "Invalid address");
        ethereumBridge = _newBridge;
    }

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
