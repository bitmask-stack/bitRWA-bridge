# bitRWA-bridge

# BitRWA Bridge Testnet Deployment & Testing

This guide provides step-by-step instructions for deploying and testing the BitRWA Bridge contracts on Ethereum Sepolia and Rootstock testnets.

## Prerequisites

1. **Node.js and npm** installed
2. **Hardhat** configured
3. **Testnet accounts** with sufficient native tokens for gas
4. **LINK tokens** for CCIP fees

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```bash
# Private key for deployment and testing (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# RPC URLs for testnets
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-project-id
ROOTSTOCK_RPC_URL=https://public-node.testnet.rsk.co

# API Keys for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key
ROOTSTOCK_EXPLORER_API_KEY=your_rootstock_explorer_api_key

# Optional: Enable gas reporting
REPORT_GAS=true
```

## Testnet Configuration

### Ethereum Sepolia
- **Chain ID**: 11155111
- **Chain Selector**: 16015286601757825753
- **CCIP Router**: 0xD0daae2231E9CB96b94C8512223533293C3693Bf
- **LINK Token**: 0x779877A7B0D9E8603169DdbD7836e478b4624789
- **ETH/USD Price Feed**: 0x694AA1769357215DE4FAC081bf1f309aDC325306

### Rootstock Testnet
- **Chain ID**: 31
- **Chain Selector**: 12532609583862916517
- **CCIP Router**: 0x536d7E53D0aDeB1F20E7c81fea45d02eC8dBD2bA
- **LINK Token**: 0x14a406c3a22d66eB2bc444fF408f9566C8DD3985
- **BTC/USD Price Feed**: 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43

## Getting Testnet Tokens

### Sepolia
1. **ETH**: Use Sepolia faucets (Infura, Alchemy, etc.)
2. **LINK**: Use Chainlink faucet or swap on Uniswap Sepolia

### Rootstock
1. **RBTC**: Use Rootstock faucet
2. **LINK**: Use Rootstock faucet or swap on RSKSwap

## Deployment Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Contracts
```bash
npx hardhat compile
```

### 3. Deploy Contracts
```bash
npx hardhat run scripts/deploy-bridge-testnet.ts --network sepolia
npx hardhat run scripts/deploy-bridge-testnet.ts --network rootstock
```

The deployment script will:
- Deploy mock ONDO and rONDO tokens
- Deploy BitRWABridge and BitRWABridgeAdapter contracts
- Link the contracts together
- Save deployment addresses to `deployments/testnet-deployment.json`

### 4. Verify Contracts (Optional)
```bash
# Verify on Sepolia
npx hardhat verify --network sepolia <BRIDGE_ADDRESS> <ROUTER> <CHAIN_SELECTOR> <ONDO_TOKEN> <ETH_USD_FEED> <ADAPTER_ADDRESS> <OWNER>

# Verify on Rootstock
npx hardhat verify --network rootstock <ADAPTER_ADDRESS> <ROUTER> <RONDO_TOKEN> <BTC_USD_FEED> <BRIDGE_ADDRESS> <CHAIN_SELECTOR> <OWNER>
```

## Testing CCIP Flow

### 1. Run Testnet Tests
```bash
npx hardhat run scripts/test-ccip-testnet.ts --network sepolia
npx hardhat run scripts/test-ccip-testnet.ts --network rootstock
```

The test script will:
- Verify contract linking
- Check account balances
- Perform Sepolia → Rootstock bridge transaction
- Perform Rootstock → Sepolia bridge transaction
- Monitor CCIP message processing
- Verify token balances after bridging

### 2. Manual Testing

You can also test manually using the deployed contracts:

#### Bridge from Sepolia to Rootstock
```javascript
// 1. Mint ONDO tokens
await ondoToken.mint(userAddress, ethers.parseEther("1000"));

// 2. Approve bridge
await ondoToken.approve(bridgeAddress, ethers.parseEther("100"));

// 3. Bridge tokens
await bridge.lockAndBridge(
  ethers.parseEther("100"),
  "12532609583862916517", // Rootstock chain selector
  userAddress,
  userAddress,
  "0x"
);
```

#### Bridge from Rootstock to Sepolia
```javascript
// 1. Mint rONDO tokens
await rOndoToken.mint(userAddress, ethers.parseEther("1000"));

// 2. Approve adapter
await rOndoToken.approve(adapterAddress, ethers.parseEther("100"));

// 3. Bridge tokens
await adapter.lockAndBridge(
  ethers.parseEther("100"),
  "16015286601757825753", // Sepolia chain selector
  userAddress,
  userAddress,
  "0x"
);
```

## Monitoring CCIP Messages

### 1. Check Message Status
Use the CCIP Router's `getLastReceivedMessageDetails` function to check message status:

```javascript
const router = await ethers.getContractAt("IRouterClient", routerAddress);
const messageDetails = await router.getLastReceivedMessageDetails();
```

### 2. Monitor Events
Listen for CCIP events:
- `TokensLocked`: Tokens locked on source chain
- `TokensUnlocked`: Tokens unlocked on destination chain
- `TokensMinted`: Tokens minted on destination chain

### 3. Check Balances
Monitor token balances on both chains to verify successful bridging.

## Troubleshooting

### Common Issues

1. **Insufficient Gas**
   - Ensure accounts have sufficient native tokens for gas
   - Rootstock uses different gas pricing (0.06 gwei)

2. **Insufficient LINK for CCIP Fees**
   - Fund accounts with LINK tokens
   - CCIP fees vary based on message size and gas costs

3. **Message Processing Delays**
   - CCIP messages can take 5-15 minutes to process
   - Check message status using router functions

4. **Contract Verification Issues**
   - Rootstock uses Sourcify for verification
   - Ensure correct constructor arguments

### Debug Commands

```bash
# Check contract state
npx hardhat console --network sepolia
npx hardhat console --network rootstock

# Run specific tests
npx hardhat test test/CCIPMessageSimulation.test.ts

# Check deployment
cat deployments/testnet-deployment.json
```

## Security Considerations

1. **Private Key Security**
   - Never commit private keys to version control
   - Use environment variables for sensitive data

2. **Testnet vs Mainnet**
   - These contracts are for testing only
   - Use different accounts for mainnet deployment

3. **CCIP Security**
   - Verify message authenticity
   - Check sender addresses
   - Validate chain selectors

## Next Steps

After successful testnet deployment and testing:

1. **Audit Contracts**: Conduct security audit
2. **Mainnet Deployment**: Deploy to mainnet networks
3. **Monitoring**: Set up monitoring and alerting
4. **Documentation**: Update documentation for production use

## Support

For issues and questions:
- Check the CCIP documentation
- Review contract logs and events
- Monitor network status and gas prices 