import { ethers as hardhatEthers, network, run } from "hardhat";
import { ZeroAddress } from "ethers";
import fs from "fs";
import path from "path";

// Import your custom config
import { routerConfig, supportedNetworks } from "../helpers/constants";
import { getFromRecord, saveContract, loadDeploymentRecord } from "../helpers/deploymentUtils";
import {ONDO_CONFIG} from "../helpers/ondoConstants"

const DEPLOYMENT_RECORD_PATH = path.join(__dirname, "deployment-record.json");

// --- Deployment Functions ---

async function deployContract(
  contractName: string,
  args: any[],
  saveAs?: string
): Promise<{ address: string; instance: any }> {
  console.log(`🚀 Deploying ${contractName}`);
  const Factory = await hardhatEthers.getContractFactory(contractName);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  if (saveAs) {
    saveContract(network.name, saveAs, address);
  }

  return { address, instance: contract };
}

async function deployMintableToken(name: string, symbol: string): Promise<string> {
  const { address } = await deployContract(
    "MockMintableERC20",
    [name, symbol],
    `${symbol}_TOKEN`
  );
  return address;
}

async function deployMockPriceFeed(asset: string, price: string, decimals: number): Promise<string> {
  const { address } = await deployContract(
    "MockV3Aggregator",
    [hardhatEthers.parseUnits(price, decimals), decimals],
    `${asset}_PRICE_FEED`
  );
  return address;
}

async function deployBridge(net: string, deployer: any): Promise<string> {
  const { address: router, chainSelector } = routerConfig[net];

  const rwaToken = ONDO_CONFIG.RWA_TOKEN?.[net] || await deployMintableToken("Ondo RWA", "oRWA");
  const priceFeed = await deployMockPriceFeed("ETH", "2000", 8);
  
  let rwaHubAddress = ONDO_CONFIG.COMPLIANCE_REGISTRY?.[net];
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

  saveArtifact("BitRWABridge", address);
  return address;
}

async function deployAdapter(net: string, deployer: any): Promise<string> {
  const { address: router } = routerConfig[net];

  const rRWA = await deployMintableToken("Rootstock RWA", "rRWA");
  const priceFeed = await deployMockPriceFeed("RBTC", "50", 8);
  const ethBridgeAddress = getFromRecord("ethereumSepolia", "BitRWABridge");

  const { address, instance: adapter } = await deployContract(
    "BitRWABridgeAdapter",
    [router, rRWA, priceFeed, ethBridgeAddress],
    "BitRWABridgeAdapter"
  );

  await adapter.setMintLimits(
    hardhatEthers.parseUnits("1000000", 18),
    hardhatEthers.parseUnits("1000", 18)
  );

  saveArtifact("BitRWABridgeAdapter", address);
  return address;
}

// --- Helper Functions ---

function saveArtifact(contractName: string, address: string) {
  const artifactPath = path.join(__dirname, `../../artifacts/contracts/${contractName}.sol/${contractName}.json`);
  const abiDir = path.join(__dirname, "../../abi");
  
  try {
    const abi = JSON.parse(fs.readFileSync(artifactPath, "utf-8")).abi;
    fs.mkdirSync(abiDir, { recursive: true });
    fs.writeFileSync(
      path.join(abiDir, `${contractName}.json`),
      JSON.stringify({ abi, address }, null, 2)
    );
    console.log(`📁 ABI saved: ${path.relative(process.cwd(), abiDir)}/${contractName}.json`);
  } catch (error) {
    console.error(`Failed to save artifact for ${contractName}:`, error);
  }
}

async function verifyContract(name: string, address: string, args: any[], retries = 3) {
  console.log(`🔍 Verifying ${name} at ${address}`);
  
  for (let i = 1; i <= retries; i++) {
    try {
      await run("verify:verify", { address, constructorArguments: args });
      console.log(`✅ Verified ${name}`);
      return;
    } catch (error: any) {
      console.warn(`⚠️ Attempt ${i}/${retries}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000 * i)); // Exponential backoff
    }
  }
  console.error(`❌ Failed to verify ${name} after ${retries} attempts`);
}

// --- Main Deployment Flow ---

async function main() {
  const net = network.name;
  const [deployer] = await hardhatEthers.getSigners();

  if (!supportedNetworks.includes(net)) {
    throw new Error(`Network ${net} not supported. Supported networks: ${supportedNetworks.join(", ")}`);
  }

  console.log(`\n🚀 Starting Ondo RWA Bridge Deployment on ${net}`);
  console.log(`👤 Deployer: ${deployer.address}`);
  console.log(`💼 Balance: ${hardhatEthers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH`);

  let contractAddress: string;
  let verificationArgs: any[] = [];

  if (net === "ethereumSepolia") {
    contractAddress = await deployBridge(net, deployer);
    verificationArgs = [
      routerConfig[net].address,
      routerConfig[net].chainSelector,
      ONDO_CONFIG.RWA_TOKEN?.[net] || ZeroAddress,
      await deployMockPriceFeed("ETH", "2000", 8),
      ONDO_CONFIG.COMPLIANCE_REGISTRY?.[net] || ZeroAddress,
      getFromRecord("rootstock", "BitRWABridgeAdapter"),
      deployer.address,
    ];
  } else if (net === "rootstock") {
    contractAddress = await deployAdapter(net, deployer);
    verificationArgs = [
      routerConfig[net].address,
      await deployMintableToken("Rootstock RWA", "rRWA"),
      await deployMockPriceFeed("RBTC", "50", 8),
      getFromRecord("ethereumSepolia", "BitRWABridge"),
    ];
  }

  await verifyContract(net === "ethereumSepolia" ? "BitRWABridge" : "BitRWABridgeAdapter", 
                     contractAddress, verificationArgs);

  console.log("\n📜 Deployment Record:");
  console.log(JSON.stringify(loadDeploymentRecord(), null, 2));

  console.log("\n✅ Deployment Complete!");
}

main().catch(error => {
  console.error("💥 Deployment Failed:", error);
  process.exit(1);
});