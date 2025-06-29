import { ethers, network, run } from "hardhat";
import { ZeroAddress } from "ethers";
import { routerConfig } from "../helpers/constants";
import { 
    getFromRecord, 
    deployMintableToken, 
    deployMockPriceFeed, 
    verifyContract,
    deployContract
} from "../helpers/deploymentUtils";
import {ONDO_CONFIG} from "../helpers/ondoConstants"

async function main() {
  // Validate network
  if (network.name !== "ethereumSepolia") {
    throw new Error("This script should only be run on Ethereum Sepolia");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Starting Bridge Deployment on ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);

  // =====================
  // 1. Deploy Dependencies
  // =====================


const { address: router } = routerConfig[network.name];
const rootstockChainSelector = routerConfig.rootstock.chainSelector; 

  // Deploy or fetch Ondo token - ensure we always get an address
  let ondoTokenAddress: string;
  if (ONDO_CONFIG.RWA_TOKEN?.[network.name] && ONDO_CONFIG.RWA_TOKEN[network.name] !== ZeroAddress) {
    ondoTokenAddress = ONDO_CONFIG.RWA_TOKEN[network.name];
    console.log(`📋 Using existing ONDO token: ${ondoTokenAddress}`);
  } else {
    ondoTokenAddress = await deployMintableToken("Ondo RWA", "oRWA");
    console.log(`🆕 Deployed new ONDO token: ${ondoTokenAddress}`);
  }
  
  // Deploy mock price feeds
  const ethToOndoPriceFeed = await deployMockPriceFeed("ETH/USDY", "0.001", 18);
  const rbtcToROndoPriceFeed = await deployMockPriceFeed("tRBTC/rUSDY", "0.00095", 18);

  // Deploy mock RWA Hub if not configured
  let rwaHubAddress = ONDO_CONFIG.COMPLIANCE_REGISTRY?.[network.name];
  if (!rwaHubAddress || rwaHubAddress === ZeroAddress) {
    const { address } = await deployContract("MockRWAHub", [], "RWA_HUB");
    rwaHubAddress = address;
  }

  // Get Rootstock adapter address
  const rootstockAdapter = getFromRecord("rootstock", "BitRWABridgeAdapter");
  if (!rootstockAdapter || rootstockAdapter === ZeroAddress) {
    throw new Error("Rootstock adapter not deployed yet");
  }

  // =====================
  // 2. Deploy Main Bridge
  // =====================
  console.log(`🔧 Deploying BitRWABridge with constructor args:`);
  console.log(`   - Router: ${router}`);
  console.log(`   - Chain Selector: ${rootstockChainSelector}`);
  console.log(`   - ONDO Token: ${ondoTokenAddress}`);
  console.log(`   - ETH/ONDO Price Feed: ${ethToOndoPriceFeed}`);
  console.log(`   - Rootstock Adapter: ${rootstockAdapter}`);
  console.log(`   - Owner: ${deployer.address}`);

  const { address: bridgeAddress, instance: bridge } = await deployContract(
    "BitRWABridge",
    [
      router,
      rootstockChainSelector,
      ondoTokenAddress,
      ethToOndoPriceFeed,
      "0x283E2C18A5B8467DD2Bd4b292359eDFa75416f5c",
      deployer.address
    ],
    "BitRWABridge"
  );

  // Type assertion to ignore TypeScript errors
  const typedBridge = bridge as any;

  // =====================
  // 3. Initial Setup
  // =====================
  console.log(`⚙️ Setting up bridge...`);
  
  // Set Rootstock token address
  const rOndoToken = await deployMintableToken("Rootstock Ondo", "rONDO");
  await typedBridge.setROndoToken(rOndoToken);
  console.log(`✅ Set rONDO token: ${rOndoToken}`);

  // Set price feeds
  await typedBridge.setPriceFeeds(ethToOndoPriceFeed, rbtcToROndoPriceFeed);
  console.log(`✅ Set price feeds`);

  // Whitelist deployer
  await typedBridge.setCompliance(deployer.address, true);
  console.log(`✅ Set deployer as compliant`);

  // Optionally: Use new admin onboarding helper
  // await typedBridge.onboardUser(deployer.address, "YOUR_BITMASK_WALLET_ADDRESS");

  // =====================
  // 4. Verification
  // =====================
  await verifyContract("BitRWABridge", bridgeAddress, [
    router,
    rootstockChainSelector,
    ondoTokenAddress,
    ethToOndoPriceFeed,
    "0x283E2C18A5B8467DD2Bd4b292359eDFa75416f5c",
    deployer.address
  ]);

  console.log("\n✅ Bridge Deployment Complete!");
  console.log(`🔗 Bridge Address: ${bridgeAddress}`);
  console.log(`💰 ONDO Token: ${ondoTokenAddress}`);
  console.log(`📊 Price Feeds: ETH/ONDO=${ethToOndoPriceFeed}, RBTC/rONDO=${rbtcToROndoPriceFeed}`);
  console.log(`🔗 Rootstock Adapter: ${`0x283E2C18A5B8467DD2Bd4b292359eDFa75416f5c`}`);
  console.log(`👤 Owner: ${deployer.address}`);
}

main().catch(error => {
  console.error("💥 Deployment Failed:", error);
  process.exit(1);
});