# 1inch Intent Swap SDK Examples

Production-quality TypeScript examples demonstrating intent-based swaps (Fusion mode) on EVM chains and Solana using the 1inch Fusion SDKs.

## What is Intent Swap (Fusion)?

Intent-based swaps allow you to:

- **Swap without paying gas** - Resolvers cover execution costs
- **Get MEV protection** - No front-running or sandwich attacks
- **Achieve optimal rates** - Dutch auction ensures competitive pricing

## Provider-Agnostic Architecture

The EVM examples demonstrate that the **Fusion SDK is truly library-agnostic**. The architecture separates concerns:

```
┌─────────────────────┐     ┌─────────────────────┐
│  Provider (ethers)  │     │  Provider (viem)    │
│  - getTokenBalance  │     │  - getTokenBalance  │
│  - approveToken     │     │  - approveToken     │
│  - web3Like adapter │     │  - web3Like adapter │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └─────────┬─────────────────┘
                     │
                     ▼
        ┌───────────────────────┐
        │  createFusionSDK()    │  ◀── Library-agnostic!
        │  (shared/types.ts)    │      Uses provider.web3Like
        └───────────────────────┘
```

**To switch libraries**, just change one import:

```typescript
// Use ethers.js:
import { createProvider } from "./providers/ethers.js";

// OR use viem:
import { createProvider } from "./providers/viem.js";

// SDK creation is the same regardless of provider!
const provider = await createProvider(config);
const sdk = createFusionSDK(config, provider.web3Like);
```

## Examples

### EVM Examples

| Script                         | Description                    | Command                    |
| ------------------------------ | ------------------------------ | -------------------------- |
| `src/evm/swap-erc20.ts`        | Swap ERC-20 to ERC-20          | `npm run evm:swap-erc20`   |
| `src/evm/swap-native.ts`       | Swap native ETH to ERC-20      | `npm run evm:swap-native`  |
| `src/evm/swap-with-permit2.ts` | Gasless approvals with Permit2 | `npm run evm:swap-permit2` |

### Solana Examples

| Script                          | Description            | Command                 |
| ------------------------------- | ---------------------- | ----------------------- |
| `src/solana/swap-sol-to-jup.ts` | Swap native SOL to JUP | `npm run solana:swap`   |
| `src/solana/cancel-order.ts`    | Cancel an active order | `npm run solana:cancel` |

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required: Your 1inch API key from https://business.1inch.com/portal
API_KEY=your-api-key

# EVM Configuration
EVM_PRIVATE_KEY=0x...          # Your wallet private key (with 0x prefix)
EVM_RPC_URL=                   # Optional: defaults to 1inch Web3
EVM_NETWORK_ID=1               # 1=Ethereum, 8453=Base, etc.

# Solana Configuration
SOLANA_PRIVATE_KEY=...         # Base58 or base64-encoded secret key
SOLANA_RPC_URL=                # Optional: defaults to 1inch Web3
```

### 3. Run Examples

```bash
# EVM Examples
npm run evm:swap-erc20      # Swap 1INCH → WETH
npm run evm:swap-native     # Swap ETH → USDC
npm run evm:swap-permit2    # Swap USDC → WETH with Permit2

# Solana Examples
npm run solana:swap         # Swap SOL → JUP
npm run solana:cancel       # Cancel an order
```

## Project Structure

```
src/evm/
├── providers/
│   ├── interface.ts          # EVMProvider interface definition
│   ├── ethers.ts             # ethers.js implementation (~95 lines)
│   └── viem.ts               # viem implementation (~105 lines)
├── shared/
│   └── types.ts              # Shared constants, utilities, createFusionSDK()
├── swap-erc20.ts             # ERC-20 to ERC-20 swap example
├── swap-native.ts            # Native ETH to ERC-20 swap example
└── swap-with-permit2.ts      # ERC-20 swap with Permit2 example

src/solana/
├── utils/
│   └── connection.ts         # Solana connection utilities
├── swap-sol-to-jup.ts
└── cancel-order.ts
```

## Switching Providers

Each example file has a clearly marked provider selection section at the top:

```typescript
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ PROVIDER SELECTION - Change this import to switch libraries              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
import { createProvider } from "./providers/ethers.js";
// import { createProvider } from "./providers/viem.js";
```

The SDK initialization is **identical** for both providers:

```typescript
const config = loadConfig();
const provider = await createProvider(config); // Library-specific
const sdk = createFusionSDK(config, provider.web3Like); // Library-agnostic!
```

### The EVMProvider Interface

Providers implement a minimal interface for blockchain operations:

```typescript
interface EVMProvider {
  address: string; // Wallet address
  web3Like: Web3Like; // Adapter for Fusion SDK

  // Read operations
  getNativeBalance(address: string): Promise<bigint>;
  getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<bigint>;
  getTokenAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<bigint>;

  // Write operations
  approveToken(tokenAddress: string, spenderAddress: string, amount: bigint): Promise<string>;
  waitForTransaction(txHash: string): Promise<void>;
}
```

## EVM Details

### Supported Networks

| Network   | Chain ID | `NetworkEnum` |
| --------- | -------- | ------------- |
| Ethereum  | 1        | `ETHEREUM`    |
| Base      | 8453     | `COINBASE`    |
| BNB Chain | 56       | `BINANCE`     |
| Polygon   | 137      | `POLYGON`     |
| Arbitrum  | 42161    | `ARBITRUM`    |
| Optimism  | 10       | `OPTIMISM`    |
| Avalanche | 43114    | `AVALANCHE`   |
| Gnosis    | 100      | `GNOSIS`      |
| Fantom    | 250      | `FANTOM`      |

### Token Addresses (Ethereum)

| Token      | Address                                      |
| ---------- | -------------------------------------------- |
| 1INCH      | `0x111111111117dC0aa78b770fA6A738034120C302` |
| WETH       | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC       | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Native ETH | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |

### Contract Addresses

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| Aggregation Router V6 | `0x111111125421ca6dc452d289314280a0f8842a65` |
| Permit2               | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## Solana Details

### Token Addresses

| Token        | Mint Address                                   | Decimals |
| ------------ | ---------------------------------------------- | -------- |
| SOL (Native) | Use `Address.NATIVE`                           | 9        |
| JUP          | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`  | 6        |
| USDC         | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6        |

### Key Differences from EVM

| Aspect             | EVM                       | Solana           |
| ------------------ | ------------------------- | ---------------- |
| Order Submission   | Off-chain to relayer      | On-chain escrow  |
| Token Approval     | Required (ERC-20 approve) | Not needed       |
| Finality           | ~12 seconds               | ~400ms           |
| Private Key Format | Hex with 0x prefix        | Base58 or base64 |

## Troubleshooting

### EVM Issues

| Error                    | Solution                                |
| ------------------------ | --------------------------------------- |
| "Insufficient allowance" | Run approval transaction first          |
| "Quote expired"          | Get a fresh quote before creating order |
| Order expires            | Try larger amounts or "fast" preset     |

### Solana Issues

| Error                        | Solution                                    |
| ---------------------------- | ------------------------------------------- |
| "Invalid PRIVATE_KEY format" | Ensure base58 or base64-encoded 64-byte key |
| "Insufficient funds"         | Add SOL for swap amount + fees              |
| "Blockhash not found"        | Transaction expired, retry                  |

## Resources

- [1inch Developer Portal](https://business.1inch.com/portal)
- [Fusion SDK GitHub](https://github.com/1inch/fusion-sdk)
- [Solana Fusion SDK GitHub](https://github.com/1inch/solana-fusion-sdk)
- [Intent Swap API Docs](https://business.1inch.com/portal/documentation/apis/swap/intent-swap/introduction)
- [ethers.js Documentation](https://docs.ethers.org/)
- [viem Documentation](https://viem.sh/)

## License

MIT
