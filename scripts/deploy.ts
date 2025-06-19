import { ethers as hardhatEthers, network, run } from "hardhat";
import { ZeroAddress } from "ethers";
import fs from "fs";
import path from "path";

import {
  CCIP_BnM_ADDRESSES,
  CCIP_LnM_ADDRESSES,
  LINK_ADDRESSES,
  routerConfig,
} from "../helpers/constants";
import verify from "./verify";

const DEPLOYMENT_RECORD_PATH = path.join(__dirname, "deployment-record.json");

type SupportedNet = "ethereumSepolia" | "rootstock";
type DeploymentRecord = Record<string, Record<string, string>>;

async function main() {
  const net = network.name as SupportedNet;

  if (!["ethereumSepolia", "rootstock"].includes(net)) {
    throw new Error(`Unsupported network: ${net}`);
  }

  const [deployer] = await hardhatEthers.getSigners();
  console.log(`Deploying to ${net} with address: ${deployer.address}`);

  const router = routerConfig[net];
  const ondoRWAToken = CCIP_BnM_ADDRESSES[net];
  const priceFeed = LINK_ADDRESSES[net]; // Replace with actual price feed address
  const rwaHub = CCIP_LnM_ADDRESSES[net]; // Replace with actual RWAHub

  if (net === "ethereumSepolia") {
    const destinationBridgeAdapter =
      getFromRecord("rootstock", "BitRWABridgeAdapter") || ZeroAddress;

    const Bridge = await hardhatEthers.getContractFactory("BitRWABridge");
    const bridge = await Bridge.deploy(
      router.address,
      BigInt(router.chainSelector),
      ondoRWAToken,
      priceFeed,
      rwaHub,
      destinationBridgeAdapter,
      deployer.address
    );

    await bridge.waitForDeployment();
    const address = await bridge.getAddress();
    console.log("BitRWABridge deployed at:", address);

    saveToRecord(net, "BitRWABridge", address);
    
    // 👇 Add this here
  await run("verify:verify", {
    address,
    constructorArguments: [
      router.address,
      BigInt(router.chainSelector),
      ondoRWAToken,
      priceFeed,
      rwaHub,
      destinationBridgeAdapter,
      deployer.address,
    ],
  });

  } else if (net === "rootstock") {
    const ethereumBridge =
      getFromRecord("ethereumSepolia", "BitRWABridge") || ZeroAddress;

    const Adapter = await hardhatEthers.getContractFactory("BitRWABridgeAdapter");
    const adapter = await Adapter.deploy(
      router.address,
      ondoRWAToken, // Mintable rRWA Token
      priceFeed,
      ethereumBridge
    );

    await adapter.waitForDeployment();
    const address = await adapter.getAddress();
    console.log("BitRWABridgeAdapter deployed at:", address);

    saveToRecord(net, "BitRWABridgeAdapter", address);

  }
}

// Deployment record helpers
function getFromRecord(network: string, contractName: string): string | null {
  if (!fs.existsSync(DEPLOYMENT_RECORD_PATH)) return null;
  const record: DeploymentRecord = JSON.parse(fs.readFileSync(DEPLOYMENT_RECORD_PATH, "utf-8"));
  return record[network]?.[contractName] || null;
}

function saveToRecord(network: string, contractName: string, address: string) {
  let record: DeploymentRecord = {};
  if (fs.existsSync(DEPLOYMENT_RECORD_PATH)) {
    record = JSON.parse(fs.readFileSync(DEPLOYMENT_RECORD_PATH, "utf-8"));
  }
  if (!record[network]) record[network] = {};
  record[network][contractName] = address;
  fs.writeFileSync(DEPLOYMENT_RECORD_PATH, JSON.stringify(record, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
