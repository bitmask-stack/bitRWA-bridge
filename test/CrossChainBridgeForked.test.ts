import { expect } from "chai";
import hre from "hardhat";
import {
  getEvm2EvmMessage,
  routeMessage,
  requestLinkFromTheFaucet,
} from "@chainlink/local/scripts/CCIPLocalSimulatorFork";

import {
  BitRWABridge,
  BitRWABridgeAdapter,
  MockMintableERC20,
  MockV3Aggregator,
  CCIPLocalSimulator,
} from "../typechain-types";

import {
  getProviderRpcUrl,
  getRouterConfig,
  getLINKTokenAddress,
} from "../helpers/utils";

import { ethers } from "ethers";

describe("BitRWA Bridge CCIP Flow", function () {
  let alice: any, adapterOwner: any;
  let sourceBridge: BitRWABridge;
  let destinationAdapter: BitRWABridgeAdapter;
  let sourceRouterAddr: string;
  let destRouterAddr: string;
  let destChainSelector: string;
  let linkAddr: string;
  let mockRwaToken: MockMintableERC20;
  let mintableRwa: MockMintableERC20;

  before(async () => {
    [alice, adapterOwner] = await hre.ethers.getSigners();

    // Configs
    const srcCfg = getRouterConfig("ethereumSepolia");
    const dstCfg = getRouterConfig("rootstock");
    sourceRouterAddr = srcCfg.address;
    [destRouterAddr, destChainSelector] = [dstCfg.address, dstCfg.chainSelector];
    linkAddr = getLINKTokenAddress("ethereumSepolia");

    // Fork Ethereum Sepolia
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: getProviderRpcUrl("ethereumSepolia") } }],
    });

    const BridgeFactory = await hre.ethers.getContractFactory("BitRWABridge", alice);
    const ERC20Factory = await hre.ethers.getContractFactory("MockMintableERC20");
    const AggregatorFactory = await hre.ethers.getContractFactory("MockV3Aggregator");

    mockRwaToken = (await ERC20Factory.deploy("RWA", "RWA")) as MockMintableERC20;
    const priceFeedEth = (await AggregatorFactory.deploy(ethers.utils.parseUnits("2000", 8))) as MockV3Aggregator;

    sourceBridge = (await BridgeFactory.deploy(
      sourceRouterAddr,
      destChainSelector,
      mockRwaToken.address,
      priceFeedEth.address,
      ethers.constants.AddressZero, // No RWA hub
      ethers.constants.AddressZero, // No attestation
      alice.address
    )) as BitRWABridge;

    await mockRwaToken.mint(alice.address, ethers.utils.parseUnits("1000", 18));
    await sourceBridge.bindBitmaskWallet(adapterOwner.address);
    await sourceBridge.setCompliance(alice.address, true);

    // Fork Rootstock
    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: getProviderRpcUrl("rootstock") } }],
    });

    const AdapterFactory = await hre.ethers.getContractFactory("BitRWABridgeAdapter", adapterOwner);
    const MintableFactory = await hre.ethers.getContractFactory("MockMintableERC20");
    const priceFeedRSK = (await AggregatorFactory.deploy(ethers.utils.parseUnits("50", 8))) as MockV3Aggregator;

    mintableRwa = (await MintableFactory.deploy("rRWA", "rRWA")) as MockMintableERC20;

    destinationAdapter = (await AdapterFactory.deploy(
      destRouterAddr,
      mintableRwa.address,
      priceFeedRSK.address,
      sourceBridge.address
    )) as BitRWABridgeAdapter;
  });

  it("locks RWA and mints rRWA via CCIP", async () => {
    const lockAmt = ethers.utils.parseUnits("100", 18);
    await mockRwaToken.connect(alice).approve(sourceBridge.address, lockAmt);

    const link = await hre.ethers.getContractAt("LinkToken", linkAddr, alice);
    const router = await hre.ethers.getContractAt("IRouterClient", sourceRouterAddr);
    const fee = await router.getFee(destChainSelector, {
      receiver: "0x", // Dummy payload
      data: "0x",
      tokenAmounts: [],
      feeToken: linkAddr,
      extraArgs: "0x",
    });

    await requestLinkFromTheFaucet(linkAddr, alice.address, fee);
    await link.connect(alice).approve(sourceRouterAddr, fee);

    const tx = await sourceBridge.connect(alice).lockAndBridge(lockAmt, adapterOwner.address, {
      value: fee,
    });
    const receipt = await tx.wait();

    const msg = getEvm2EvmMessage(receipt);
    if (!msg) throw new Error("Message not found");

    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{ forking: { jsonRpcUrl: getProviderRpcUrl("rootstock") } }],
    });

    await routeMessage(destRouterAddr, msg);

    const rRwaAddr = await destinationAdapter.rRWAToken();
    const rRwa = await hre.ethers.getContractAt("MockMintableERC20", rRwaAddr) as MockMintableERC20;
    const finalBalance = await rRwa.balanceOf(adapterOwner.address);

    expect(finalBalance).to.be.gt(0);
  });
});
