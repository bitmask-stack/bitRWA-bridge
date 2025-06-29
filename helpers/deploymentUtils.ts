import fs from "fs";
import path from "path";
import { ZeroAddress } from "ethers";
import { ethers, network, run } from "hardhat";


const DEPLOYMENT_RECORD_PATH = path.join(__dirname, "deployment-record.json");

interface DeploymentRecord {
  metadata: {
    version: string;
    purpose: string;
    timestamp: string;
  };
  contracts: Record<string, Record<string, string>>;
}

export function loadDeploymentRecord(): DeploymentRecord {
  try {
    if (fs.existsSync(DEPLOYMENT_RECORD_PATH)) {
      return JSON.parse(fs.readFileSync(DEPLOYMENT_RECORD_PATH, "utf-8"));
    }
  } catch (error) {
    console.warn("Failed to load deployment record:", error);
  }
  
  return {
    metadata: {
      version: "1.0",
      purpose: "Ondo RWA Bridge Deployment",
      timestamp: new Date().toISOString(),
    },
    contracts: {},
  };
}

export function saveDeploymentRecord(record: DeploymentRecord) {
  try {
    fs.writeFileSync(DEPLOYMENT_RECORD_PATH, JSON.stringify(record, null, 2));
  } catch (error) {
    console.error("Failed to save deployment record:", error);
    throw error;
  }
}

export function saveContract(network: string, name: string, address: string) {
  const record = loadDeploymentRecord();
  record.contracts[network] = record.contracts[network] || {};
  record.contracts[network][name] = address;
  saveDeploymentRecord(record);
}

export function getFromRecord(network: string, contractName: string): string {
  const record = loadDeploymentRecord();
  return record.contracts?.[network]?.[contractName] || ZeroAddress;
}

// Helper functions (could be moved to a shared utilities file)
export async function deployContract(contractName: string, args: any[], saveAs?: string) {
    console.log(`🚀 Deploying ${contractName}`);
    const Factory = await ethers.getContractFactory(contractName);
    const contract = await Factory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
  
    if (saveAs) {
      saveContract(network.name, saveAs, address);
    }
  
    return { address, instance: contract };
  }
  
  export async function deployMintableToken(name: string, symbol: string) {
    const { address } = await deployContract(
      "MockMintableERC20",
      [name, symbol, 18],
      `${symbol}_TOKEN`
    );
    return address;
  }
  
  export async function deployMockPriceFeed(asset: string, price: string, decimals: number) {
    const { address } = await deployContract(
      "MockV3Aggregator",
      [ethers.parseUnits(price, decimals), decimals],
      `${asset}_PRICE_FEED`
    );
    return address;
  }
  
  export async function verifyContract(name: string, address: string, args: any[], retries = 3) {
    console.log(`🔍 Verifying ${name} at ${address}`);
    for (let i = 1; i <= retries; i++) {
      try {
        await run("verify:verify", { address, constructorArguments: args });
        console.log(`✅ Verified ${name}`);
        return;
      } catch (error: any) {
        console.warn(`⚠️ Attempt ${i}/${retries}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000 * i));
      }
    }
    console.error(`❌ Failed to verify ${name} after ${retries} attempts`);
  }
  interface DeploymentRecord {
    [network: string]: {
      [contractName: string]: string;
    };
  }
  
//   export function saveContract(network: string, name: string, address: string) {
//     let record: DeploymentRecord = {};
    
//     if (fs.existsSync(DEPLOYMENT_RECORD_PATH)) {
//       record = JSON.parse(fs.readFileSync(DEPLOYMENT_RECORD_PATH, "utf-8"));
//     }
  
//     record[network] = record[network] || {};
//     record[network][name] = address;
    
//     fs.writeFileSync(DEPLOYMENT_RECORD_PATH, JSON.stringify(record, null, 2));
//   }
  
//   export function getFromRecord(network: string, contractName: string): string {
//     if (!fs.existsSync(DEPLOYMENT_RECORD_PATH)) {
//       return ZeroAddress;
//     }
    
//     const record: DeploymentRecord = JSON.parse(fs.readFileSync(DEPLOYMENT_RECORD_PATH, "utf-8"));
//     return record[network]?.[contractName] || ZeroAddress;
//   }
  
  export function saveArtifact(contractName: string, address: string) {
    const artifactPath = path.join(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);
    const abiDir = path.join(__dirname, "../abi");
    
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