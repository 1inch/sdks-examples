/**
 * Shared Types and Constants for 1inch Fusion SDK on EVM Chains
 *
 * This module contains library-agnostic types, constants, and utilities
 * that are shared between ethers.js and viem implementations.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Import from this module for:
 * - Configuration types and loading
 * - Token and contract addresses
 * - Order status enum
 * - Utility functions (sleep, formatAmount)
 *
 * Import from ethers/provider.ts or viem/provider.ts for:
 * - Library-specific wallet creation
 * - Library-specific SDK initialization
 */

import { FusionSDK, NetworkEnum, PrivateKeyProviderConnector, type Web3Like } from "@1inch/fusion-sdk";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// SUPPORTED NETWORKS
// ═══════════════════════════════════════════════════════════════════════════
// Mapping from chain ID (string) to NetworkEnum (SDK type)
// Only chains supported by 1inch Fusion are included
// Chain ID reference: https://chainlist.org/
export const NETWORK_MAP: Record<string, NetworkEnum> = {
  "1": NetworkEnum.ETHEREUM, // Ethereum Mainnet
  "8453": NetworkEnum.COINBASE, // Base (Coinbase L2)
  "56": NetworkEnum.BINANCE, // BNB Smart Chain
  "137": NetworkEnum.POLYGON, // Polygon PoS
  "42161": NetworkEnum.ARBITRUM, // Arbitrum One
  "10": NetworkEnum.OPTIMISM, // Optimism
  "43114": NetworkEnum.AVALANCHE, // Avalanche C-Chain
  "100": NetworkEnum.GNOSIS, // Gnosis Chain (formerly xDai)
  "250": NetworkEnum.FANTOM, // Fantom Opera
  "324": NetworkEnum.ZKSYNC, // zkSync Era
  "59144": NetworkEnum.LINEA, // Linea
  "146": NetworkEnum.SONIC, // Sonic
  "130": NetworkEnum.UNICHAIN // Unichain
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════
// Common token addresses for different networks
// Always verify addresses before using in production!
export const TOKENS = {
  ethereum: {
    // NATIVE is a sentinel address recognized by 1inch API
    // It represents the chain's native token (ETH on Ethereum)
    NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    // Wrapped ETH - ERC-20 version of ETH
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    // USD Coin - 6 decimals (unlike most tokens with 18)
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    // Tether USD - 6 decimals
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    // 1inch Token - 18 decimals
    "1INCH": "0x111111111117dC0aa78b770fA6A738034120C302",
    // Dai Stablecoin - 18 decimals
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F"
  },
  base: {
    NATIVE: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    // USDC on Base (bridged from Ethereum)
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    // USDS (Sky Dollar) on Base
    USDS: "0x820c137fa70c8691f0e44dc420a5e53c168921dc"
  }
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════
// These addresses are the SAME on all supported EVM chains (cross-chain deployment)
export const CONTRACTS = {
  // 1inch Aggregation Router v6 - Handles swaps and order execution
  // This is where you approve tokens for standard Fusion swaps
  AGGREGATION_ROUTER_V6: "0x111111125421ca6dc452d289314280a0f8842a65",
  // Native Orders Factory - Used internally by the SDK
  NATIVE_ORDERS_FACTORY: "0xa562172dd87480687debca1cd7ab6a309919e9d8",
  // Permit2 (Uniswap) - Universal approval contract
  // Approve here once, use across all Permit2-compatible protocols
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3"
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// ORDER STATUS ENUM
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Possible statuses for a Fusion order (re-exported from @1inch/fusion-sdk).
 *
 * Status meanings:
 * - Pending: Order is active, waiting for resolver to fill
 * - Filled: Order completed successfully
 * - FalsePredicate: Order condition (if any) evaluated to false
 * - NotEnoughBalanceOrAllowance: User's balance/allowance insufficient
 * - Expired: Auction ended without being filled
 * - PartiallyFilled: Part of the order was filled (possible for large orders)
 * - WrongPermit: Permit2 signature was invalid
 * - Cancelled: Order was explicitly cancelled by maker
 * - InvalidSignature: Order signature verification failed
 */

// ═══════════════════════════════════════════════════════════════════════════
// ERC-20 ABI (Minimal)
// ═══════════════════════════════════════════════════════════════════════════
// Minimal ABI for ERC-20 token interactions
// Using human-readable format supported by both ethers.js and viem
export const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
] as const;

// Viem-compatible ABI format (for type safety)
export const ERC20_ABI_VIEM = [
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }]
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }]
  }
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration object for SDK initialization
 */
export interface Config {
  /** 1inch API key (required for all API calls) */
  apiKey: string;
  /** Wallet private key for signing orders (hex string starting with 0x) */
  privateKey: string;
  /** RPC URL for blockchain queries (defaults to 1inch Web3) */
  rpcUrl: string;
  /** Chain ID as string (e.g., "1" for Ethereum mainnet) */
  networkId: string;
}

/**
 * Hex string type (for viem compatibility)
 */
export type Hex = `0x${string}`;

/**
 * Address type (for viem compatibility)
 */
export type Address = `0x${string}`;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Constructs the 1inch Web3 URL for a given chain.
 *
 * The Web3 Gateway provides reliable, rate-limited RPC access using your API key.
 * Benefits:
 * - Single API key for both Fusion API and RPC calls
 * - Built-in rate limiting and reliability
 * - No need to manage multiple RPC providers
 *
 * @param networkId - Chain ID (e.g., "1" for Ethereum)
 * @returns Full RPC URL
 */
export function getDefaultRpcUrl(networkId: string): string {
  return `https://api.1inch.com/web3/${networkId}`;
}

/**
 * Loads and validates configuration from environment variables.
 *
 * Required environment variables:
 * - API_KEY: Your 1inch API key (get from portal.1inch.dev)
 * - EVM_PRIVATE_KEY: Your wallet's private key (hex, starting with 0x)
 *
 * Optional environment variables:
 * - EVM_NETWORK_ID: Chain ID (defaults to "1" for Ethereum mainnet)
 * - EVM_RPC_URL: Custom RPC URL (defaults to 1inch Web3)
 *
 * @returns Validated configuration object
 * @throws Error if required variables are missing or invalid
 */
export function loadConfig(): Config {
  const apiKey = process.env.API_KEY;
  const privateKey = process.env.EVM_PRIVATE_KEY;
  const networkId = process.env.EVM_NETWORK_ID || "1";

  if (!apiKey) {
    throw new Error("Missing required environment variable: API_KEY");
  }

  const rpcUrl = process.env.EVM_RPC_URL || getDefaultRpcUrl(networkId);

  if (!privateKey) {
    throw new Error("Missing required environment variable: EVM_PRIVATE_KEY");
  }

  if (!privateKey.startsWith("0x")) {
    throw new Error("EVM_PRIVATE_KEY must start with 0x");
  }

  return { apiKey, privateKey, rpcUrl, networkId };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pauses execution for a specified duration.
 * Used for polling order status without overwhelming the API.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats a token amount from smallest units to human-readable string.
 *
 * Examples:
 * - formatAmount(1000000000000000000n, 18) => "1.000000"
 * - formatAmount(10000000n, 6) => "10.000000"
 *
 * @param amount - Amount in smallest units (wei, etc.)
 * @param decimals - Token decimals (18 for most tokens, 6 for USDC/USDT)
 * @returns Formatted string with up to 6 decimal places
 */
export function formatAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  return `${integerPart}.${fractionalStr.slice(0, 6)}`;
}

/**
 * Checks if a URL is using the 1inch Web3.
 * Used to determine if Authorization header should be added.
 *
 * @param rpcUrl - RPC URL to check
 * @returns true if URL is 1inch Web3
 */
export function is1inchGateway(rpcUrl: string): boolean {
  return rpcUrl.includes("api.1inch.com/web3");
}

// ═══════════════════════════════════════════════════════════════════════════
// FUSION SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a Fusion SDK instance using any Web3Like provider.
 *
 * This function is PROVIDER-AGNOSTIC - it works with the web3Like adapter
 * from either ethers.js or viem (or any other library that implements Web3Like).
 *
 * The separation of provider creation and SDK initialization demonstrates that
 * the 1inch Fusion SDK is truly library-agnostic.
 *
 * @param config - Configuration object from loadConfig()
 * @param web3Like - Web3Like adapter from any provider implementation
 * @returns Configured FusionSDK instance
 * @throws Error if network ID is not supported
 *
 * @example
 * ```typescript
 * import { createProvider } from "./providers/ethers.js";
 * // OR
 * import { createProvider } from "./providers/viem.js";
 *
 * const config = loadConfig();
 * const provider = await createProvider(config);
 * const sdk = createFusionSDK(config, provider.web3Like);
 *
 * // Now use the SDK
 * const quote = await sdk.getQuote(params);
 * ```
 */
export function createFusionSDK(config: Config, web3Like: Web3Like): FusionSDK {
  // Validate network
  const network = NETWORK_MAP[config.networkId];
  if (!network) {
    const supported = Object.keys(NETWORK_MAP).join(", ");
    throw new Error(`Unsupported network ID: ${config.networkId}. Supported: ${supported}`);
  }

  // Create the blockchain provider connector
  // This wraps the Web3Like adapter with signing capabilities
  const connector = new PrivateKeyProviderConnector(config.privateKey, web3Like);

  // Initialize and return the SDK
  return new FusionSDK({
    url: "https://api.1inch.com/fusion",
    network,
    blockchainProvider: connector,
    authKey: config.apiKey
  });
}
