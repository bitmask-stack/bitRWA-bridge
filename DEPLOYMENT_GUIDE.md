# BitRWA Bridge Deployment Guide

## Overview
This guide covers the deployment of the complete BitRWA bridge system from Ethereum Sepolia to Rootstock Testnet using Chainlink CCIP.

## Architecture
- **Ethereum Bridge**: `BitRWABridge.sol` - Locks ONDO tokens and sends CCIP messages
- **Rootstock Adapter**: `BitRWABridgeAdapter.sol` - Receives CCIP messages and mints rONDO tokens
- **Tokens**: ONDO (Ethereum) ↔ rONDO (Rootstock)

## Prerequisites
1. Deployed ONDO token on Ethereum Sepolia
2. Deployed rONDO token on Rootstock Testnet (with minting capability)
3. Configured price feeds for both chains
4. Sufficient test tokens and gas fees

## Deployment Steps

### 1. Deploy Rootstock Adapter

```bash
# Deploy to Rootstock Testnet
npx hardhat run scripts/deployRootstockAdapter.ts --network rootstock
```

**Configuration:**
- CCIP Router: `0x536d7E53D0aDeB1F20E7c81fea45d02eC8dBD2b8` (Rootstock testnet)
- rONDO Token: `0x936A3dC8f7d72B2edd4EE232500Ec9d873cd2416`
- rONDO Price Feed: `0x06D64035403457dd0d68ed0b8ff3F6EF498C97a5`
- Ethereum Bridge: `0x00C25653a7b8bEf78F766c0Cbdc62580702e7838`
- Ethereum Chain Selector: `11155111` (Sepolia)

### 2. Update Ethereum Bridge

After deploying the adapter, update the Ethereum bridge with the new adapter address:

```bash
# Update the bridge configuration
npx hardhat run scripts/updateEthereumBridge.ts --network ethereumSepolia
```

**Note:** Replace `NEW_ROOTSTOCK_ADAPTER_ADDRESS` in the script with the actual deployed adapter address.

### 3. Test the Complete Bridge Flow

```bash
# Test the bridge functionality
npx hardhat run scripts/testCompleteBridge.ts --network ethereumSepolia
```

## Bridge Flow

### Ethereum → Rootstock
1. User calls `lockAndBridge()` on Ethereum bridge
2. ONDO tokens are locked in the bridge contract
3. CCIP message sent to Rootstock with: `(ethUser, bitmaskWallet, ondoAmount, ethValue, true)`
4. Rootstock adapter receives message and mints rONDO tokens
5. Confirmation sent back to Ethereum

### Rootstock → Ethereum
1. Rootstock adapter sends confirmation with: `(messageId, ondoAmount, ethValue, rOndoAmount, rbtcValue)`
2. Ethereum bridge receives confirmation and updates state

## Key Features

### Ethereum Bridge (`BitRWABridge.sol`)
- ✅ User compliance checking
- ✅ Wallet binding (Ethereum ↔ Rootstock)
- ✅ Token allowance and balance validation
- ✅ Dynamic fee calculation
- ✅ CCIP message sending
- ✅ Confirmation handling
- ✅ Emergency withdrawal functions

### Rootstock Adapter (`BitRWABridgeAdapter.sol`)
- ✅ CCIP message receiving
- ✅ rONDO token minting
- ✅ Price feed integration
- ✅ Confirmation sending back to Ethereum
- ✅ Mint data tracking
- ✅ Emergency functions

## Configuration

### Ethereum Sepolia
- Bridge: `0x00C25653a7b8bEf78F766c0Cbdc62580702e7838`
- ONDO Token: `0x717C3087fe043A4C9455142148932b94562D1244`
- CCIP Router: `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59`
- Chain Selector: `11155111`

### Rootstock Testnet
- Adapter: `[Deployed Address]`
- rONDO Token: `0x936A3dC8f7d72B2edd4EE232500Ec9d873cd2416`
- CCIP Router: `0x536d7E53D0aDeB1F20E7c81fea45d02eC8dBD2b8`
- Chain Selector: `8953668971247136127`

## Testing

### Pre-deployment Tests
```bash
npx hardhat test
```

### Post-deployment Tests
1. **User Setup**: Set compliance and bind wallet
2. **Token Approval**: Approve ONDO tokens for bridge
3. **Bridge Test**: Execute `lockAndBridge` transaction
4. **Verification**: Check rONDO tokens minted on Rootstock

### Monitoring
- Monitor CCIP message delivery
- Check token balances on both chains
- Verify price feed accuracy
- Track bridge events and confirmations

## Troubleshooting

### Common Issues
1. **Insufficient Fee**: Check CCIP router fee calculation
2. **Token Approval**: Ensure sufficient allowance
3. **Compliance**: Verify user is whitelisted
4. **Wallet Binding**: Check Rootstock address is bound
5. **Price Feed**: Verify price feed is working

### Debug Commands
```bash
# Check bridge status
npx hardhat run scripts/check-bridge-status.ts --network ethereumSepolia

# Check user compliance
npx hardhat run scripts/check-user-status.ts --network ethereumSepolia

# Test price feeds
npx hardhat run scripts/test-price-feeds.ts --network rootstock
```

## Security Considerations
- Only owner can update critical parameters
- Emergency withdrawal functions available
- Input validation on all public functions
- Proper access control with modifiers
- Safe token transfers using SafeERC20

## Next Steps
1. Deploy to mainnet networks
2. Implement additional security measures
3. Add monitoring and alerting
4. Optimize gas usage
5. Add additional token support 


 url: process.env.ROOTSTOCK_RPC_URL || "https://public-node.testnet.rsk.co", // Public endpoint fallback
      accounts: process.env.MNEMONIC ? { mnemonic: process.env.MNEMONIC } : [],