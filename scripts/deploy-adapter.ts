import { ethers, network, run } from "hardhat";
import { ZeroAddress } from "ethers";
import { routerConfig } from "../helpers/constants";
import { deployContract, getFromRecord, saveArtifact, deployMintableToken, deployMockPriceFeed, verifyContract } from "../helpers/deploymentUtils";

async function main() {
  // Validate network
  if (network.name !== "rootstock") {
    throw new Error("This script should only be run on Rootstock");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`\n🚀 Starting Adapter Deployment on ${network.name}`);
  console.log(`👤 Deployer: ${deployer.address}`);

  // Deploy Adapter
  const { address: router } = routerConfig[network.name];

  const rRWA = await deployMintableToken("Rootstock RWA", "rRWA");
  const priceFeed = await deployMockPriceFeed("RBTC", "50", 8);
  const ethBridgeAddress = getFromRecord("ethereumSepolia", "BitRWABridge");

  const { address, instance: adapter } = await deployContract(
    "BitRWABridgeAdapter",
    [router, rRWA, priceFeed, ethBridgeAddress],
    "BitRWABridgeAdapter"
  );
  
//   await adapter.setMintLimits(
//     ethers.parseUnits("1000000", 18),
//     ethers.parseUnits("1000", 18)
//   );

  // Verification
  await verifyContract("BitRWABridgeAdapter", address, [
    router,
    rRWA,
    priceFeed,
    ethBridgeAddress
  ]);

  console.log("\n✅ Adapter Deployment Complete!");
}
main().catch(error => {
    console.error("💥 Adapter Deployment Failed:", error);
    process.exit(1);
  });
