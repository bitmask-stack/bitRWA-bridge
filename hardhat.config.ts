import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHEREUM_SEPOLIA_RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL;
const ROOTSTOCK_RPC_URL = process.env.ROOTSTOCK_RPC_URL;
const MNEMONIC = process.env.MNEMONIC

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ethereumSepolia: {
      url: ETHEREUM_SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111
    },
    rootstock: {
      url: ROOTSTOCK_RPC_URL || "",
      accounts: {mnemonic: MNEMONIC},
      chainId: 31,
    }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      rootstock: process.env.ROOTSTOCK_EXPLORER_API_KEY || "",
      rootstockTestnet: process.env.ROOTSTOCK_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "rootstock",
        chainId: 30,
        urls: {
          apiURL: "https://blockscout.com/rsk/mainnet/api",
          browserURL: "https://explorer.rsk.co"
        }
      },
      {
        network: "rootstockTestnet",
        chainId: 31,
        urls: {
          apiURL: "https://rootstock.blockscout.com/api",
          browserURL: "https://rootstock.blockscout.com"
        }
      },
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io"
        }
      }
    ]
  },
  sourcify: {
    enabled: true,
    // Optional: Explicitly set the Sourcify server URL if needed
    // apiUrl: "https://sourcify.dev/server",
    // browserUrl: "https://repo.sourcify.dev"
  }
};

export default config;