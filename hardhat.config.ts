import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ethereumSepolia: {
      url: process.env.ETHEREUM_SEPOLIA_RPC_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: 20000000000, // 20 gwei
    },
    avalancheTestnet: {
      url: process.env.AVANLANCHE_RPC_TESTNET,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 43113,
      gasPrice: 20000000000, // 20 gwei
    },
    rootstock: {
      url: process.env.ROOTSTOCK_RPC_URL || "https://public-node.testnet.rsk.co",
      accounts: process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : [],
      chainId: 31,
      gasPrice: 60000000, // 0.06 gwei (RSK uses different gas pricing)
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      rootstock: process.env.ROOTSTOCK_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "rootstock",
        chainId: 31,
        urls: {
          apiURL: "https://explorer.testnet.rsk.co/api",
          browserURL: "https://explorer.testnet.rsk.co",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;