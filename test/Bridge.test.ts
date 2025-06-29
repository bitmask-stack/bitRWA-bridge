import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { id, AbiCoder } from "ethers";



describe("BitRWABridge and BitRWABridgeAdapter Integration", function () {
    async function deployBridgeFixture() {
        const [deployer, user1, user2] = await hre.ethers.getSigners();

        // Deploy tokens and mocks
        const MockMintableERC20 = await hre.ethers.getContractFactory("MockMintableERC20");
        const rRWAToken = await MockMintableERC20.deploy("rRWA Token", "rRWA");
        const ondoRWAToken = await MockMintableERC20.deploy("Ondo RWA Token", "OndoRWA");

        const MockV3Aggregator = await hre.ethers.getContractFactory("MockV3Aggregator");
        const ethPriceFeed = await MockV3Aggregator.deploy(3000e8, 8); // $3000
        const rskPriceFeed = await MockV3Aggregator.deploy(0.05e8, 8); // $0.05

        const MockRWAHub = await hre.ethers.getContractFactory("MockRWAHub");
        const rwaHub = await MockRWAHub.deploy();

        // Deploy CCIP simulator
        const CCIPLocalSimulator = await hre.ethers.getContractFactory("CCIPLocalSimulator");
        const ccipLocalSimulator = await CCIPLocalSimulator.deploy();

        // Deploy bridge contracts
        const BitRWABridge = await hre.ethers.getContractFactory("BitRWABridge");
        const BitRWABridgeAdapter = await hre.ethers.getContractFactory("BitRWABridgeAdapter");

        const simulatorConfig = await ccipLocalSimulator.configuration();

        const bitRWABridgeAdapter = await BitRWABridgeAdapter.deploy(
            simulatorConfig.destinationRouter_,
            await rRWAToken.getAddress(),
            await rskPriceFeed.getAddress(),
            deployer.address // Temporary placeholder
        );

        const bitRWABridge = await BitRWABridge.deploy(
            simulatorConfig.sourceRouter_,
            2n, // RSK chain selector
            await ondoRWAToken.getAddress(),
            await ethPriceFeed.getAddress(),
            await rwaHub.getAddress(),
            await bitRWABridgeAdapter.getAddress(),
            deployer.address
        );

        // Set the correct bridge address
        await bitRWABridgeAdapter.setEthereumBridge(await bitRWABridge.getAddress());

        // Mint tokens to user1
        await ondoRWAToken.mint(user1.address, hre.ethers.parseUnits("100", 18));

        return {
            deployer,
            user1,
            user2,
            rRWAToken,
            ondoRWAToken,
            ethPriceFeed,
            rskPriceFeed,
            rwaHub,
            ccipLocalSimulator,
            bitRWABridge,
            bitRWABridgeAdapter,
            routerEth: simulatorConfig.sourceRouter_,
            routerRSK: simulatorConfig.destinationRouter_,
            ETHEREUM_BRIDGE_ADDRESS: await bitRWABridge.getAddress(),
        };
    }

    beforeEach(async function () {
        Object.assign(this, await loadFixture(deployBridgeFixture));
    });

    describe("End-to-End CCIP Bridge Simulation", function () {
        const AMOUNT = hre.ethers.parseUnits("50", 18);
        const ETH_VALUE = hre.ethers.parseEther("0.1");
        const ETH_PRICE = hre.ethers.parseUnits("3000", 18); // $3000 with 18 decimals

        it("should allow a compliant user to lock Ondo RWA and bridge to rRWA on RSK", async function () {
            // Setup compliance and wallet binding
            await this.bitRWABridge.setCompliance(this.user1.address, true);
            const bitmaskWallet = hre.ethers.Wallet.createRandom().address;
            await this.bitRWABridge.connect(this.user1).bindBitmaskWallet(bitmaskWallet);

            // Approve and lock tokens
            await this.ondoRWAToken.connect(this.user1).approve(this.bitRWABridge, AMOUNT);
            const initialBalance = await this.rRWAToken.balanceOf(bitmaskWallet);

            // Lock and bridge - this should trigger the CCIP message via the simulator
            const tx = await this.bitRWABridge.connect(this.user1).lockAndBridge(
                AMOUNT,
                bitmaskWallet,
                { value: ETH_VALUE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs?.find((l: any) => 
                this.bitRWABridge.interface.parseLog(l)?.name === "AssetLocked"
            );
            const messageId = event?.args?.ccipMessageId;

            // The CCIPLocalSimulator should automatically process the message
            // We just need to verify the final state
            const expectedAmount = await this.bitRWABridgeAdapter.simulateReceive(
                this.user1.address,
                bitmaskWallet,
                AMOUNT,
                ETH_PRICE
            );

            // Verify the rRWA was minted to the bitmask wallet
            expect(await this.rRWAToken.balanceOf(bitmaskWallet)).to.equal(
                initialBalance + expectedAmount
            );

            // Verify bridge completion
            await expect(this.bitRWABridge.connect(this.deployer).completeBridge(
                messageId,
                bitmaskWallet,
                expectedAmount
            )).to.emit(this.bitRWABridge, "BridgeCompleted");
        });

        it("should revert if user is not compliant", async function () {
            await this.ondoRWAToken.connect(this.user2).approve(this.bitRWABridge, AMOUNT);
            await expect(
                this.bitRWABridge.connect(this.user2).lockAndBridge(
                    AMOUNT,
                    hre.ethers.Wallet.createRandom().address,
                    { value: ETH_VALUE }
                )
            ).to.be.revertedWith("User not compliant (KYC/AML)");
        });

        it("should revert if wallet is not bound", async function () {
            await this.bitRWABridge.setCompliance(this.user2.address, true);
            await this.ondoRWAToken.connect(this.user2).approve(this.bitRWABridge, AMOUNT);
            await expect(
                this.bitRWABridge.connect(this.user2).lockAndBridge(
                    AMOUNT,
                    hre.ethers.Wallet.createRandom().address,
                    { value: ETH_VALUE }
                )
            ).to.be.revertedWith("Wallet not bound");
        });

  
        it("should revert on invalid CCIP message sender", async function () {
            const bitmaskWallet = hre.ethers.Wallet.createRandom().address;
            const testAmount = hre.ethers.parseUnits("50", 18);
            const testPrice = hre.ethers.parseUnits("3000", 18);
            
            // Create test data
            const data = AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256", "bool"],
                [this.user1.address, bitmaskWallet, testAmount, testPrice, false]
            );
        
            // Create invalid sender (not the bridge address)
            const invalidSender = hre.ethers.Wallet.createRandom().address;
            const invalidSenderEncoded = AbiCoder.defaultAbiCoder().encode(
                ["address"],
                [invalidSender]
            );
        
            // Get adapter address
            const adapterAddress = await this.bitRWABridgeAdapter.getAddress();
            
            // 1. Store original code
            const originalCode = await hre.ethers.provider.getCode(adapterAddress);
            
            // 2. Make contract appear as un-deployed
            await hre.network.provider.send("hardhat_setCode", [adapterAddress, "0x"]);
            
            // 3. Execute test
            await expect(
                this.bitRWABridgeAdapter.testOnly_verifySender(
                    invalidSenderEncoded,
                    data
                )
            ).to.be.revertedWithCustomError(
                this.bitRWABridgeAdapter,
                "UnauthorizedSenderFromRouter"
            );
            
            // 4. Restore original code
            await hre.network.provider.send("hardhat_setCode", [adapterAddress, originalCode]);
        });

        it("should revert if msg.sender is not the router", async function () {
            const bitmaskWallet = hre.ethers.Wallet.createRandom().address;
            const testAmount = hre.ethers.parseUnits("50", 18);
            const testPrice = hre.ethers.parseUnits("3000", 18);
            
            // Create valid message data
            const data = AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256", "bool"],
                [this.user1.address, bitmaskWallet, testAmount, testPrice, false]
            );
        
            // Try to call the test helper directly (not as router)
            await expect(
                this.bitRWABridgeAdapter.connect(this.deployer).simulateCCIPReceiveForTest(
                    id("test"),
                    1n,
                    this.ETHEREUM_BRIDGE_ADDRESS,
                    data
                )
            ).to.be.revertedWith("Only for testing purposes");
        });
    });
});