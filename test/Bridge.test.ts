// test/Bridge.test.ts
import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-toolbox/network-helpers";
  import { expect } from "chai";
  import { ethers } from "hardhat";
  import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
  
  // Import generated Typechain types for your contracts and mocks
  import {
    MockMintableERC20,
    MockV3Aggregator,
    MockRWAHub,
    CCIPLocalSimulator,
    BitRWABridge,
    BitRWABridgeAdapter,
    IRouterClient, // Interface for the router
  } from "../typechain-types"; // Adjust path if your typechain-types are elsewhere
  
  // Import the ABI for IRouterClient (needed to create ethers.Contract instance)
  import IRouterClientAbi from "@chainlink/contracts-ccip/artifacts/contracts/interfaces/IRouterClient.sol/IRouterClient.json";
  
  // Define a type for the Client.Any2EVMMessage structure for simulation clarity
  interface Any2EVMMessage {
    messageId: string;
    sourceChainSelector: bigint; // uint64
    sender: string; // bytes, abi.encode(address)
    data: string; // bytes, abi.encode(payload)
    tokenAmounts: { token: string; amount: bigint }[]; // Client.EVMTokenAmount[]
    extraArgs: string; // bytes
    feeToken: string; // address
  }
  
  describe("BitRWABridge and BitRWABridgeAdapter Integration", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
  
    let rRWAToken: MockMintableERC20;
    let ondoRWAToken: MockMintableERC20;
    let ethPriceFeed: MockV3Aggregator;
    let rskPriceFeed: MockV3Aggregator;
    let rwaHub: MockRWAHub;
  
    let ccipRouterEth: IRouterClient;
    let ccipRouterRSK: IRouterClient;
    let bitRWABridge: BitRWABridge;
    let bitRWABridgeAdapter: BitRWABridgeAdapter;
    let ccipLocalSimulator: CCIPLocalSimulator;
  
    // Define Chain Selectors (arbitrary for local simulation)
    const ETH_CHAIN_SELECTOR: bigint = 12345n;
    const RSK_CHAIN_SELECTOR: bigint = 67890n;
    const ETHEREUM_BRIDGE_ADDRESS: string = ethers.Wallet.createRandom().address; // Mock Ethereum bridge address
  
    // Price feed answers (e.g., 1 ETH = 3000 USD, 1 RSK = 0.05 USD for calculation)
    const ETH_PRICE_FEED_ANSWER: bigint = ethers.parseUnits("3000", 8); // Price feed has 8 decimals
    const RSK_PRICE_FEED_ANSWER: bigint = ethers.parseUnits("0.05", 8); // Price feed has 8 decimals
  
    // Note: The `priceFeed.latestRoundData()` in your contracts multiplies by `1e10`
    // This is because Chainlink Price Feeds typically return 8 decimals, and you're scaling it to 18.
    // Make sure your mock price feeds return values consistent with this expectation.
    const MINT_AMOUNT_RWA: bigint = ethers.parseUnits("100", 18); // Example RWA amount to bridge
  
    before(async function () {
      [deployer, user1, user2] = await ethers.getSigners();
  
      // --- Deploy Mock Contracts ---
      const MockMintableERC20Factory = await ethers.getContractFactory("MockMintableERC20");
      const MockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
      const MockRWAHubFactory = await ethers.getContractFactory("MockRWAHub");
  
      // Deploy rRWA Token (on RSK side simulation)
      rRWAToken = await MockMintableERC20Factory.deploy("rRWA Token", "rRWA");
  
      // Deploy Ondo RWA Token (on Ethereum side simulation)
      ondoRWAToken = await MockMintableERC20Factory.deploy("Ondo RWA Token", "OndoRWA");
  
      // Deploy Price Feeds
      ethPriceFeed = await MockV3AggregatorFactory.deploy(ETH_PRICE_FEED_ANSWER, 8); // ETH price in USD
      rskPriceFeed = await MockV3AggregatorFactory.deploy(RSK_PRICE_FEED_ANSWER, 8); // RSK price in USD
  
      // Deploy Mock RWAHub
      rwaHub = await MockRWAHubFactory.deploy();
  
      // --- Deploy CCIP Local Simulator ---
      const CCIPLocalSimulatorFactory = await ethers.getContractFactory("CCIPLocalSimulator");
      ccipLocalSimulator = await CCIPLocalSimulatorFactory.deploy();
  
      // Configure the simulator with arbitrary chain selectors
      await ccipLocalSimulator.setConfigs(
        [
          { chainSelector: ETH_CHAIN_SELECTOR, router: ethers.ZeroAddress }, // Router will be set later
          { chainSelector: RSK_CHAIN_SELECTOR, router: ethers.ZeroAddress }
        ],
        ethers.ZeroAddress // Default token address (not used in this specific simulation of native transfers)
      );
  
      // Get mock router addresses from the simulator
      // You'll interact with these mock routers directly in the simulator
      ccipRouterEth = new ethers.Contract(await ccipLocalSimulator.routerAtChain(ETH_CHAIN_SELECTOR), IRouterClientAbi.abi, deployer) as unknown as IRouterClient;
      ccipRouterRSK = new ethers.Contract(await ccipLocalSimulator.routerAtChain(RSK_CHAIN_SELECTOR), IRouterClientAbi.abi, deployer) as unknown as IRouterClient;
  
      // --- Deploy Your Contracts ---
      const BitRWABridgeFactory = await ethers.getContractFactory("BitRWABridge");
      const BitRWABridgeAdapterFactory = await ethers.getContractFactory("BitRWABridgeAdapter");
  
      // Deploy BitRWABridge (on Ethereum side simulation)
      bitRWABridge = await BitRWABridgeFactory.deploy(
        await ccipRouterEth.getAddress(),
        RSK_CHAIN_SELECTOR,
        await ondoRWAToken.getAddress(),
        await ethPriceFeed.getAddress(),
        await rwaHub.getAddress()
      );
  
      // Deploy BitRWABridgeAdapter (on RSK side simulation)
      bitRWABridgeAdapter = await BitRWABridgeAdapterFactory.deploy(
        await ccipRouterRSK.getAddress(),
        await rRWAToken.getAddress(),
        await rskPriceFeed.getAddress(),
        ETHEREUM_BRIDGE_ADDRESS // This will be the sender on the ETH side, mimicked by CCIPLocalSimulator
      );
  
      // --- Configure CCIP Local Simulator to route messages ---
      // The CCIPLocalSimulator needs to know which contract on the target chain is the receiver
      // for messages from the source chain's router.
      await ccipLocalSimulator.setRouterCallback(
        ETH_CHAIN_SELECTOR, // Source chain for messages going to RSK
        RSK_CHAIN_SELECTOR, // Destination chain
        await bitRWABridgeAdapter.getAddress() // Receiver on RSK
      );
  
      // For confirmation messages going back to ETH
      await ccipLocalSimulator.setRouterCallback(
        RSK_CHAIN_SELECTOR, // Source chain for messages going to ETH
        ETH_CHAIN_SELECTOR, // Destination chain
        await bitRWABridge.getAddress() // Receiver on ETH (for confirmation)
      );
  
      // Mint some Ondo RWA tokens to user1 for testing
      await ondoRWAToken.mint(user1.address, MINT_AMOUNT_RWA * 2n); // Mint more than needed
    });
  
    describe("End-to-End CCIP Bridge Simulation", function () {
      const AMOUNT_TO_BRIDGE_ONDO: bigint = ethers.parseUnits("50", 18);
      const ETH_TO_BRIDGE_VALUE: bigint = ethers.parseEther("0.1"); // Value for CCIP fees
  
      it("should allow a compliant user to lock Ondo RWA and bridge to rRWA on RSK", async function () {
        // 1. Set user1 as compliant on BitRWABridge
        await expect(bitRWABridge.connect(deployer).setCompliance(user1.address, true))
          .to.emit(bitRWABridge, "ComplianceStatusUpdated")
          .withArgs(user1.address, true);
  
        // 2. Bind Bitmask wallet for user1
        const bitmaskWallet: string = ethers.Wallet.createRandom().address;
        await expect(bitRWABridge.connect(user1).bindBitmaskWallet(bitmaskWallet))
          .to.emit(bitRWABridge, "WalletBound"); // Assuming you might want to add a WalletBound event
  
        expect(await bitRWABridge.bitmaskWalletBindings(user1.address)).to.equal(bitmaskWallet);
  
        // 3. Approve Ondo RWA tokens for BitRWABridge
        await ondoRWAToken.connect(user1).approve(
          await bitRWABridge.getAddress(),
          AMOUNT_TO_BRIDGE_ONDO
        );
  
        // Check initial balances
        const initialUserOndoBalance: bigint = await ondoRWAToken.balanceOf(user1.address);
        const initialBridgeOndoBalance: bigint = await ondoRWAToken.balanceOf(await bitRWABridge.getAddress());
        const initialBitmaskRRWABalance: bigint = await rRWAToken.balanceOf(bitmaskWallet);
  
        // 4. User initiates lockAndBridge on Ethereum side
        const simulateTx = await bitRWABridge.connect(user1).lockAndBridge(
          AMOUNT_TO_BRIDGE_ONDO,
          bitmaskWallet,
          { value: ETH_TO_BRIDGE_VALUE } // Sufficient value for CCIP fee
        );
  
        const txReceipt = await simulateTx.wait();
        // Use Hardhat's event parsing for better type safety if available,
        // or cast to `any` for direct access if `typechain` doesn't generate specific event types in `txReceipt.logs`.
        // For `AssetLocked` event: AssetLocked(address indexed user, uint256 amount, bytes32 indexed ccipMessageId)
        const assetLockedEvent = txReceipt?.logs?.find((log: any) =>
          (bitRWABridge.interface.parseLog(log)?.name === "AssetLocked")
        );
        const messageId: string = assetLockedEvent?.args?.ccipMessageId;
  
        expect(messageId).to.not.be.undefined;
  
        await expect(simulateTx)
          .to.emit(bitRWABridge, "AssetLocked")
          .withArgs(user1.address, AMOUNT_TO_BRIDGE_ONDO, messageId);
  
        // Verify Ondo RWA tokens transferred to bridge
        expect(await ondoRWAToken.balanceOf(user1.address)).to.equal(
          initialUserOndoBalance - AMOUNT_TO_BRIDGE_ONDO
        );
        expect(await ondoRWAToken.balanceOf(await bitRWABridge.getAddress())).to.equal(
          initialBridgeOndoBalance + AMOUNT_TO_BRIDGE_ONDO
        );
  
        // 5. Simulate the CCIP message on the RSK side using the simulator
        // The `_ccipReceive` function expects `message.sender` to be `ETHEREUM_BRIDGE_ADDRESS`
        // and `message.data` to be `abi.encode(msg.sender, bitmaskWallet, amount, normalizedPrice)`
        const encodedData: string = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256", "uint256"],
          [user1.address, bitmaskWallet, AMOUNT_TO_BRIDGE_ONDO, ETH_PRICE_FEED_ANSWER * 10n**10n]
        );
  
        const ccipMessage: Any2EVMMessage = {
          messageId: messageId,
          sourceChainSelector: ETH_CHAIN_SELECTOR,
          sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [ETHEREUM_BRIDGE_ADDRESS]),
          data: encodedData,
          tokenAmounts: [], // No tokens sent directly with this message
          extraArgs: ethers.AbiCoder.defaultAbiCoder().encode(["bytes"], [ethers.ZeroHash]), // Empty extraArgs to trigger confirmation
          feeToken: ethers.ZeroAddress // No fee token for this part of simulation
        };
  
        const expectedMintAmount: bigint = await bitRWABridgeAdapter.simulateReceive(
          user1.address,
          bitmaskWallet,
          AMOUNT_TO_BRIDGE_ONDO,
          ETH_PRICE_FEED_ANSWER * 10n**10n
        );
  
        await expect(ccipLocalSimulator.simulateCCIPReceive(
          RSK_CHAIN_SELECTOR, // Target chain selector for receiver
          await bitRWABridgeAdapter.getAddress(), // The actual receiver contract address
          ccipMessage
        ))
          .to.emit(bitRWABridgeAdapter, "MessageReceived")
          .withArgs(
            messageId,
            ETH_CHAIN_SELECTOR,
            ETHEREUM_BRIDGE_ADDRESS,
            user1.address,
            bitmaskWallet,
            AMOUNT_TO_BRIDGE_ONDO,
            ETH_PRICE_FEED_ANSWER * 10n**10n
          )
          .to.emit(bitRWABridgeAdapter, "rRWAMinted")
          .withArgs(bitmaskWallet, expectedMintAmount, RSK_PRICE_FEED_ANSWER * 10n**10n); // Expect normalized RSK price
  
        // Verify rRWA tokens minted to bitmaskWallet
        expect(await rRWAToken.balanceOf(bitmaskWallet)).to.equal(
          initialBitmaskRRWABalance + expectedMintAmount
        );
  
        // 6. Simulate the confirmation message being sent back to Ethereum
        // The simulator automatically triggers the confirmation send from adapter
        // You can check the simulator's sent messages.
        const sentMessages = await ccipLocalSimulator.getSentMessages(RSK_CHAIN_SELECTOR, ETH_CHAIN_SELECTOR);
        expect(sentMessages.length).to.equal(1);
        expect(sentMessages[0].receiver).to.equal(ETHEREUM_BRIDGE_ADDRESS);
        
        // Decode the data for confirmation: (originalMessageId, bitmaskWallet, mintedAmount)
        const decodedConfirmationData: [string, string, bigint] = ethers.AbiCoder.defaultAbiCoder().decode(
          ["bytes32", "address", "uint256"],
          sentMessages[0].data
        ) as [string, string, bigint];
        
        expect(decodedConfirmationData[0]).to.equal(messageId);
        expect(decodedConfirmationData[1]).to.equal(bitmaskWallet);
        expect(decodedConfirmationData[2]).to.equal(expectedMintAmount);
  
        // Simulate the bridge owner completing the bridge manually (or via an oracle seeing the confirmation)
        await expect(bitRWABridge.connect(deployer).completeBridge(
          messageId,
          bitmaskWallet,
          expectedMintAmount
        ))
          .to.emit(bitRWABridge, "BridgeCompleted")
          .withArgs(messageId, bitmaskWallet, expectedMintAmount);
      });
  
      it("should revert if user is not compliant", async function () {
        await ondoRWAToken.connect(user2).approve(
          await bitRWABridge.getAddress(),
          AMOUNT_TO_BRIDGE_ONDO
        );
        await expect(
          bitRWABridge.connect(user2).lockAndBridge(
            AMOUNT_TO_BRIDGE_ONDO,
            ethers.Wallet.createRandom().address,
            { value: ETH_TO_BRIDGE_VALUE }
          )
        ).to.be.revertedWith("User not compliant (KYC/AML)");
      });
  
      it("should revert if wallet is not bound", async function () {
        await bitRWABridge.connect(deployer).setCompliance(user2.address, true);
        await ondoRWAToken.connect(user2).approve(
          await bitRWABridge.getAddress(),
          AMOUNT_TO_BRIDGE_ONDO
        );
        await expect(
          bitRWABridge.connect(user2).lockAndBridge(
            AMOUNT_TO_BRIDGE_ONDO,
            ethers.Wallet.createRandom().address, // Unbound wallet
            { value: ETH_TO_BRIDGE_VALUE }
          )
        ).to.be.revertedWith("Wallet not bound");
      });
  
      it("should revert on `_ccipReceive` if sender is not the Ethereum bridge", async function () {
        const encodedData: string = ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256", "uint256"],
          [user1.address, ethers.Wallet.createRandom().address, AMOUNT_TO_BRIDGE_ONDO, ETH_PRICE_FEED_ANSWER]
        );
  
        const invalidSenderCCIPMessage: Any2EVMMessage = {
          messageId: ethers.id("some_id"),
          sourceChainSelector: ETH_CHAIN_SELECTOR,
          sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [ethers.Wallet.createRandom().address]), // Invalid sender
          data: encodedData,
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress
        };
  
        await expect(ccipLocalSimulator.simulateCCIPReceive(
          RSK_CHAIN_SELECTOR,
          await bitRWABridgeAdapter.getAddress(),
          invalidSenderCCIPMessage
        )).to.be.revertedWith("Unauthorized sender");
      });
    });
  });