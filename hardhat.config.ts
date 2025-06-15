import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import  dotenv  from "dotenv"

dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ETHEREUM_SEPOLIA_RPC_URL = process.env.ETHEREUM_SEPOLIA_RPC_URL;
const ROOTSTOCK_RPC_URL = process.env.ROOTSTOCK_RPC_URL;

const ROOTSTOCK_MAINNET_CHAINID=process.env.ROOTSTOCK_MAINNET_CHAINID;
const ROOTSTOCK_TESTNET_CHAINID=process.env.ROOTSTOCK_TESTNET_CHAINID;
const ETHEREUM_SEPOLIA_MAINNET_CHAINID=process.env.ETHEREUM_SEPOLIA_MAINNET_CHAINID;
const ETHEREUM_SEPOLIA_TESTNET_CHAINID=process.env.ETHEREUM_SEPOLIA_TESTNET_CHAINID;

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ethereumSepolia: {
      url:
        ETHEREUM_SEPOLIA_RPC_URL !== undefined ? ETHEREUM_SEPOLIA_RPC_URL : "",
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      chainId: 11155111
    },

    rootstock: {
      url:
      ROOTSTOCK_RPC_URL !== undefined ? ROOTSTOCK_RPC_URL : "",
    accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    chainId: 31,
    }
  }
};

export default config;
