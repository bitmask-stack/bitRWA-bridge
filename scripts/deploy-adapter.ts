import { ethers, network, run } from "hardhat";
import { ZeroAddress } from "ethers";
import { routerConfig, supportedNetworks } from "../helpers/constants";
import { 
    deployContract, 
    getFromRecord, 
    deployMintableToken, 
    deployMockPriceFeed, 
    verifyContract 
} from "../helpers/deploymentUtils";

async function main() {
  // Validate network
  if (!supportedNetworks.includes(network.name)) {
    throw new Error(`Unsupported network: ${network.name}. Supported networks: ${supportedNetworks.join(', ')}`);
  }

  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Starting Adapter Deployment on ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);

  // =====================
  // 1. Get Network Config
  // =====================
  const networkConfig = routerConfig[network.name as keyof typeof routerConfig];
  if (!networkConfig) {
    throw new Error(`No router config found for network ${network.name}`);
  }

  // =====================
  // 2. Deploy Dependencies
  // =====================
  const rRWA = await deployMintableToken("Rootstock RWA", "rRWA");
  const priceFeed = await deployMockPriceFeed("RBTC", "50", 8);
  
  // Get Ethereum bridge address
  const ethBridgeAddress = getFromRecord("ethereumSepolia", "BitRWABridge");
  if (!ethBridgeAddress || ethBridgeAddress === ZeroAddress) {
    throw new Error("Ethereum bridge not deployed yet");
  }

  // =====================
  // 3. Deploy Adapter
  // =====================
  const { address, instance: adapter } = await deployContract(
    "BitRWABridgeAdapter",
    [
      networkConfig.address,    // CCIP Router
      rRWA,
      priceFeed,
      ethBridgeAddress,
      routerConfig.ethereumSepolia.chainSelector,
      deployer.address
    ],
    "BitRWABridgeAdapter"
  );

  // =====================
  // 4. Verification
  // =====================
  try {
    await verifyContract("BitRWABridgeAdapter", address, [
      networkConfig.address,
      rRWA,
      priceFeed,
      ethBridgeAddress,
      routerConfig.ethereumSepolia.chainSelector,
      deployer.address
    ]);
  } catch (verificationError) {
    console.warn("⚠️ Verification failed:", verificationError);
  }

  console.log("\n✅ Adapter Deployment Complete!");
  console.log(`🔗 Adapter Address: ${address}`);
  console.log(`💰 rRWA Token: ${rRWA}`);
  console.log(`📊 Price Feed: ${priceFeed}`);
  console.log(`🌉 Ethereum Bridge: ${ethBridgeAddress}`);
}

main().catch(error => {
  console.error("💥 Deployment Failed:", error);
  process.exit(1);
});