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

  // Deploy Bridge
  const { address: router, chainSelector } = routerConfig[network.name];

  const rwaToken = ONDO_CONFIG.RWA_TOKEN?.[network.name] || await deployMintableToken("Ondo RWA", "oRWA");
  const priceFeed = await deployMockPriceFeed("ETH", "2000", 8);
  
  let rwaHubAddress = ONDO_CONFIG.COMPLIANCE_REGISTRY?.[network.name];
  if (!rwaHubAddress || rwaHubAddress === ZeroAddress) {
    const { address } = await deployContract("MockRWAHub", [], "RWA_HUB");
    rwaHubAddress = address;
  }

  const destinationBridgeAdapter = getFromRecord("rootstock", "BitRWABridgeAdapter");

  const { address, instance: bridge } = await deployContract(
    "BitRWABridge",
    [
      router,
      chainSelector,
      rwaToken,
      priceFeed,
      rwaHubAddress,
      destinationBridgeAdapter,
      deployer.address
    ],
    "BitRWABridge"
  );

  await bridge.setCompliance(deployer.address, true);
  await bridge.bindBitmaskWallet(deployer.address);

  // Verification
  await verifyContract("BitRWABridge", address, [
    router,
    chainSelector,
    rwaToken,
    priceFeed,
    rwaHubAddress,
    destinationBridgeAdapter,
    deployer.address
  ]);

  console.log("\n✅ Bridge Deployment Complete!");
}
main().catch(error => {
    console.error("💥 Bridge Deployment Failed:", error);
    process.exit(1);
  });