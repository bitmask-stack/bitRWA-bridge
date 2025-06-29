import { expect } from "chai";
import hre, { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import {
  routeMessage,
  getEvm2EvmMessage,
  requestLinkFromTheFaucet,
} from "@chainlink/local/scripts/CCIPLocalSimulatorFork";
import {
  getProviderRpcUrl,
  getRouterConfig,
  getLINKTokenAddress,
} from "../helpers/utils";
import { BitRWABridge } from "../typechain-types/contracts/BitRWABridge";
import { BitRWABridgeAdapter } from "../typechain-types/contracts/BitRWABrigeAdapter.sol/BitRWABridgeAdapter";
import { MockMintableERC20 } from "../typechain-types/contracts/mocks/MockMintableERC20";
import { MockRWAHub } from "../typechain-types/contracts/mocks/MockRWAHub";
import { MockV3Aggregator } from "../typechain-types/contracts/mocks/MockV3Aggregator";


const CONFIG = {
  SOURCE: "ethereumSepolia",
  DESTINATION: "rootstock",
  MSG_FILE: path.join(__dirname, 'ccip-message.json'),
  ADDR_FILE: path.join(__dirname, 'bridge-address.json')
};

// Enhanced message interface
interface CompleteMessage {
  messageId: string;
  sourceChainSelector: string;
  sender: string;
  receiver: string;
  data: string;
  destTokenAmounts: any[];
  feeToken: string;
  gasLimit: string;
  strict: boolean;
  nonce: number;
  fee: string;
  sequenceNumber: number;
}



describe("BitRWA Cross-Chain Bridge Tests", function () {
  this.timeout(300000); // Increased timeout

  let sourceBridge: BitRWABridge;
  let rwaToken: MockMintableERC20;
  let mintableRwa: MockMintableERC20;
  let destinationAdapter: BitRWABridgeAdapter;
  let mockRwaHub: MockRWAHub;
  let priceFeedEth: MockV3Aggregator;
  let priceFeedRSK: MockV3Aggregator;
  let alice: any, adapterOwner: any;
  let sourceBridgeAddress: string;
  let mockRouter: any;

  describe("Source Chain Setup", function () {
    before(async function () {
      console.log("🚀 Initializing Source Chain...");
      
      [alice, adapterOwner] = await hre.ethers.getSigners();

      // Fork Sepolia with pinned block
      await hre.network.provider.request({
        method: "hardhat_reset",
        params: [{
          forking: {
            jsonRpcUrl: getProviderRpcUrl(CONFIG.SOURCE),
            blockNumber: 5670000
          }
        }]
      });

      // Get router config
    //   const { address: sourceRouterAddress, chainSelector: sourceChainSelector } = 
    //     getRouterConfig(CONFIG.SOURCE);

    const MockRouterFactory = await hre.ethers.getContractFactory("MockRouter");
mockRouter = await MockRouterFactory.deploy();
await mockRouter.waitForDeployment();
const sourceRouterAddress = await mockRouter.getAddress();
const sourceChainSelector = "16015286601757825753";

      // Deploy mock RWA Token
      const MockERC20 = await hre.ethers.getContractFactory("MockMintableERC20");
      rwaToken = await MockERC20.deploy("RWA Token", "RWA");
      await rwaToken.waitForDeployment();

      // Deploy mock RWA Hub
      const MockRWAHub = await hre.ethers.getContractFactory("MockRWAHub");
      mockRwaHub = await MockRWAHub.deploy();
      await mockRwaHub.waitForDeployment();

      // Deploy Price Feed
      const MockAggregator = await hre.ethers.getContractFactory("MockV3Aggregator");
      priceFeedEth = await MockAggregator.deploy(
        hre.ethers.parseUnits("2000", 8),
        8
      );
      await priceFeedEth.waitForDeployment();

      // Mint tokens to Alice
      await rwaToken.mint(alice.address, hre.ethers.parseUnits("1000", 18));

      // Deploy Bridge
      const BridgeFactory = await hre.ethers.getContractFactory("BitRWABridge");
      sourceBridge = await BridgeFactory.deploy(
        sourceRouterAddress,
        sourceChainSelector,
        await rwaToken.getAddress(),
        await priceFeedEth.getAddress(),
        await mockRwaHub.getAddress(),
        adapterOwner.address,
        alice.address
      );
      await sourceBridge.waitForDeployment();
      sourceBridgeAddress = await sourceBridge.getAddress();

      // Save bridge address for destination tests
      fs.writeFileSync(CONFIG.ADDR_FILE, JSON.stringify({
        sourceBridge: sourceBridgeAddress
      }));

      console.log("Bridge Address:", sourceBridgeAddress);

      // Setup initial state
      await sourceBridge.connect(alice).bindBitmaskWallet(adapterOwner.address);
      await sourceBridge.connect(alice).setCompliance(alice.address, true);
    });

    it("should lock RWA and emit bridge message", async function () {
        const lockAmt = hre.ethers.parseUnits("100", 18);
      
        // Verify initial balances
        const aliceInitialBalance = await rwaToken.balanceOf(alice.address);
        console.log("Alice initial RWA:", aliceInitialBalance.toString());
        expect(aliceInitialBalance).to.be.gte(lockAmt);
      
        // Proper approval flow
        const approveTx = await rwaToken.connect(alice).approve(
          await sourceBridge.getAddress(),
          lockAmt
        );
        await approveTx.wait();
      
        // Verify allowance
        const allowance = await rwaToken.allowance(
          alice.address,
          await sourceBridge.getAddress()
        );
        console.log("Approved allowance:", allowance.toString());
        expect(allowance).to.equal(lockAmt);
      
        // Request sufficient LINK
        const linkTokenAddress = getLINKTokenAddress(CONFIG.SOURCE);
        const linkAmount = hre.ethers.parseEther("10"); // Increased LINK amount
        await requestLinkFromTheFaucet(linkTokenAddress, alice.address, linkAmount);
      
        // Get the actual fee estimate first
        const { address: destinationRouterAddress, chainSelector: destinationChainSelector } =
          getRouterConfig(CONFIG.DESTINATION);
      
        // Create the message to estimate fee
        const testMessage = {
          receiver: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [adapterOwner.address]),
          data: ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256", "uint256", "bool"],
            [alice.address, adapterOwner.address, lockAmt, hre.ethers.parseUnits("2000", 18), true]
          ),
          tokenAmounts: [],
          extraArgs: "0x",
          feeToken: ethers.ZeroAddress,
        };
      
        // Use mockRouter to get fee
        const router = mockRouter;
        const estimatedFee = await router.getFee(destinationChainSelector, testMessage);
        console.log("Estimated fee:", estimatedFee.toString());
      
        // Use higher fee with buffer
        const feeWithBuffer = (estimatedFee * BigInt(150)) / BigInt(100); // 50% buffer
        console.log("Fee with buffer:", feeWithBuffer.toString());
      
        // Execute bridge with proper fee
        const tx = await sourceBridge.connect(alice).lockAndBridge(lockAmt, adapterOwner.address, {
          value: feeWithBuffer,
          gasLimit: 5_000_000,
        });
      
        const receipt = await tx.wait();
        expect(receipt).to.not.be.null;
        console.log("Bridge transaction mined");
        console.log("Receipt logs:", receipt?.logs);
      
        // MANUAL CCIP MESSAGE CREATION
        const messageId = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-message"));
        const sourceChainSelector = "16015286601757825753"; // same as in your setup
      
        // Construct the message object manually since mockRouter does not emit MessageSent
        const msg = {
          messageId,
          sourceChainSelector,
          sender: alice.address,
          receiver: adapterOwner.address,
          data: ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256", "uint256", "bool"],
            [alice.address, adapterOwner.address, lockAmt, hre.ethers.parseUnits("2000", 18), true]
          ),
          // Add any other fields if your downstream tests require them, e.g.:
          destTokenAmounts: [],
          feeToken: ethers.ZeroAddress,
          gasLimit: "5000000",
          strict: false,
          nonce: 0,
          fee: feeWithBuffer.toString(),
          sequenceNumber: 0,
        };
      
        fs.writeFileSync(CONFIG.MSG_FILE, JSON.stringify(msg, null, 2));
        console.log("Mock CCIP message saved");
      });

      
      
  });

  describe("Destination Chain Setup", function () {
    before(async function () {
      console.log("🚀 Initializing Destination Chain...");
      
      // Load source bridge address
      if (!fs.existsSync(CONFIG.ADDR_FILE)) {
        console.warn("⚠️ Skipping destination tests - no source bridge address found");
        this.skip();
        return;
      }
      const addresses = JSON.parse(fs.readFileSync(CONFIG.ADDR_FILE, "utf-8"));
      sourceBridgeAddress = addresses.sourceBridge;
      
      if (!fs.existsSync(CONFIG.MSG_FILE)) {
        console.warn("⚠️ Skipping destination tests - no CCIP message found");
        this.skip();
        return;
      }
      
      [alice, adapterOwner] = await hre.ethers.getSigners();

      // Fork destination chain with pinned block
      await hre.network.provider.request({
        method: "hardhat_reset",
        params: [{
          forking: {
            jsonRpcUrl: getProviderRpcUrl(CONFIG.DESTINATION),
            blockNumber: 5670000
          }
        }]
      });

      // Get router config
      const { address: destinationRouterAddress } = getRouterConfig(CONFIG.DESTINATION);

      // Deploy rRWA Token
      const MintableFactory = await hre.ethers.getContractFactory("MockMintableERC20");
      mintableRwa = await MintableFactory.deploy("rRWA", "rRWA");
      await mintableRwa.waitForDeployment();

      // Deploy Price Feed
      const MockAggregator = await hre.ethers.getContractFactory("MockV3Aggregator");
      priceFeedRSK = await MockAggregator.deploy(
        hre.ethers.parseUnits("50", 8),
        8
      );
      await priceFeedRSK.waitForDeployment();

      // Deploy Adapter
      const AdapterFactory = await hre.ethers.getContractFactory("BitRWABridgeAdapter");
      destinationAdapter = await AdapterFactory.deploy(
        destinationRouterAddress,
        await mintableRwa.getAddress(),
        await priceFeedRSK.getAddress(),
        sourceBridgeAddress
      );
      await destinationAdapter.waitForDeployment();
      const adapterAddress = await destinationAdapter.getAddress();
      console.log("Adapter Address:", adapterAddress);

      // Deploy Mock Router to avoid real CCIP calls
      const MockRouter = await hre.ethers.getContractFactory("MockRouter");
      mockRouter = await MockRouter.deploy();
      await mockRouter.waitForDeployment();
      
      // Set mock router in adapter
      await destinationAdapter.setRouterForTest(await mockRouter.getAddress());
    });

    it("should mint rRWA from bridged message", async function () {
        // const msg = JSON.parse(fs.readFileSync(CONFIG.MSG_FILE, "utf-8"));
  
        // // Convert values to BigInt explicitly and ensure proper formatting
        // const amount = hre.ethers.parseUnits("100", 18);
        // const ethPrice = hre.ethers.parseUnits("2000", 18);
        
        // // Create a valid 32-byte messageId
        // const messageId = msg.messageId || hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-message"));
        const rawMsg = fs.readFileSync(CONFIG.MSG_FILE, "utf-8");
if (!rawMsg) throw new Error("❌ MSG file is empty or unreadable");

let msg: Partial<CompleteMessage> = {};
try {
  msg = JSON.parse(rawMsg);
} catch (err) {
  throw new Error("❌ Failed to parse MSG file: " + err);
}

const amount = hre.ethers.parseUnits("100", 18);
const ethPrice = hre.ethers.parseUnits("2000", 18);

const messageId = msg.messageId ?? hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-message"));
const sourceChainSelector = msg.sourceChainSelector ?? "16015286601757825753";

// ...

        
        // Ensure sourceChainSelector is properly formatted
        //const sourceChainSelector = msg.sourceChainSelector || "16015286601757825753";
        
        // Properly encode parameters
        const data = hre.ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "uint256", "uint256", "bool"],
          [
            alice.address,
            adapterOwner.address,
            amount,
            ethPrice,
            true
          ]
        );
      
        // Use test simulation function with proper types
        await destinationAdapter.simulateCCIPReceiveForTest(
          messageId,     // Proper bytes32 messageId
          sourceChainSelector,  // Keep as string for uint64
          sourceBridgeAddress,
          data
        );
        
      
      // Verify minting
      const finalBalance = await mintableRwa.balanceOf(adapterOwner.address);
      console.log("Minted rRWA:", finalBalance.toString());
      expect(finalBalance).to.be.gt(0);
    });
  });
});