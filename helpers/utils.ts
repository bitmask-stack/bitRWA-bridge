import {
  CCIP_BnM_ADDRESSES,
  CCIP_LnM_ADDRESSES,
  LINK_ADDRESSES,
  PayFeesIn,
  routerConfig,
} from "./constants";

export const getProviderRpcUrl = (network: string) => {
  let rpcUrl;

  switch (network) {
    case "ethereumSepolia":
      rpcUrl = process.env.ETHEREUM_SEPOLIA_RPC_URL;
      break;
    case "rootstock":
      rpcUrl = process.env.ROOTSTOCK_RPC_URL;
      break;
    default:
      throw new Error("Unknown network: " + network);
  }

  if (!rpcUrl)
    throw new Error(
      `rpcUrl empty for network ${network} - check your environment variables`
    );

  return rpcUrl;
};

export const getPrivateKey = () => {
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey)
    throw new Error(
      "private key not provided - check your environment variables"
    );

  return privateKey;
};

export const getRouterConfig = (network: string) => {
  switch (network) {
    case "ethereumSepolia":
      return routerConfig.ethereumSepolia;
    case "rootstock":
      return routerConfig.rootstock;
    default:
      throw new Error("Unknown network: " + network);
  }
};

export const getPayFeesIn = (payFeesIn: string) => {
  let fees;

  switch (payFeesIn) {
    case "Native":
      fees = PayFeesIn.Native;
      break;
    case "native":
      fees = PayFeesIn.Native;
      break;
    case "LINK":
      fees = PayFeesIn.LINK;
      break;
    case "link":
      fees = PayFeesIn.LINK;
      break;
    default:
      fees = PayFeesIn.Native;
      break;
  }

  return fees;
};

export const getFaucetTokensAddresses = (network: string) => {
  return {
    ccipBnM: CCIP_BnM_ADDRESSES[network],
    ccipLnM: CCIP_LnM_ADDRESSES[network],
  };
};

export const getLINKTokenAddress = (network: string) => {
  return LINK_ADDRESSES[network];
};
