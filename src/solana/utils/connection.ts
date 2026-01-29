/**
 * Connection Utilities for 1inch Solana Fusion SDK
 *
 * This module provides shared utilities for Solana Fusion swap examples:
 * - Configuration loading and validation
 * - Solana connection and wallet creation
 * - SDK initialization
 * - Common constants (token addresses)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOLANA VS EVM DIFFERENCES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Key differences from EVM examples:
 *
 * 1. PRIVATE KEY FORMAT:
 *    - EVM: Hex string (0x...)
 *    - Solana: Base64-encoded 64-byte secret key
 *
 * 2. ADDRESS FORMAT:
 *    - EVM: Hex (0x...) - 40 characters
 *    - Solana: Base58 encoded - variable length (~44 characters)
 *
 * 3. TOKENS:
 *    - EVM: ERC-20 contract addresses
 *    - Solana: SPL token mint addresses
 *
 * 4. UNITS:
 *    - EVM: Wei (10^18 for ETH)
 *    - Solana: Lamports (10^9 for SOL)
 *
 * 5. TRANSACTION MODEL:
 *    - EVM: Single instruction per tx (typically)
 *    - Solana: Multiple instructions per tx (common)
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Sdk, Address } from "@1inch/solana-fusion-sdk";
import axios from "axios";
import bs58 from "bs58";
import dotenv from "dotenv";

// HTTP provider interface (matches SDK's expected interface)
interface HttpProvider {
  get<T>(url: string, headers: Record<string, string>): Promise<T>;
  post<T>(url: string, data: unknown, headers: Record<string, string>): Promise<T>;
}

// Custom HTTP provider using axios (workaround for ESM subpath import issue)
class AxiosHttpProvider implements HttpProvider {
  async get<T>(url: string, headers: Record<string, string>): Promise<T> {
    const res = await axios.get<T>(url, { headers });
    return res.data;
  }
  async post<T>(url: string, data: unknown, headers: Record<string, string>): Promise<T> {
    const res = await axios.post<T>(url, data, { headers });
    return res.data;
  }
}

// Load environment variables from .env file
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MINT ADDRESSES (SOLANA MAINNET)
// ═══════════════════════════════════════════════════════════════════════════
// SPL token addresses on Solana mainnet-beta
// These are the "mint" addresses that identify each token
//
// Note: For native SOL, use Address.NATIVE from the SDK instead of an address
export const TOKENS = {
  // USDC - Circle's official SPL token (6 decimals)
  // Most widely used stablecoin on Solana
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",

  // JUP - Jupiter Exchange governance token (6 decimals)
  // Popular for testing swaps due to high liquidity
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",

  // BONK - Solana's most popular memecoin (5 decimals)
  // Very high volume, good for testing small amounts
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",

  // RAY - Raydium DEX token (6 decimals)
  RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration object for Solana SDK initialization
 */
export interface Config {
  /** 1inch API key (required for Fusion API calls) */
  apiKey: string;
  /** Solana wallet secret key (base64-encoded 64-byte key) */
  privateKey: string;
  /** Solana RPC URL (defaults to 1inch Web3) */
  rpcUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loads and validates configuration from environment variables.
 *
 * Required environment variables:
 * - API_KEY: Your 1inch API key (get from https://business.1inch.com/portal)
 * - SOLANA_PRIVATE_KEY: Base64-encoded 64-byte secret key
 *
 * Optional environment variables:
 * - SOLANA_RPC_URL: Custom RPC endpoint (defaults to 1inch Web3)
 *
 * HOW TO GET YOUR SOLANA PRIVATE KEY:
 *
 * Option 1 - From your wallet:
 *   Most Solana wallets allow exporting the private key (base58 format)
 *
 * Option 2 - From solana-keygen CLI:
 *   solana-keygen new --outfile my-keypair.json
 *
 * Supported formats:
 * - Base58 (Solana's native format)
 * - Base64 (alternative encoding)
 *
 * @returns Validated configuration object
 * @throws Error if required variables are missing
 */
export function loadConfig(): Config {
  const apiKey = process.env.API_KEY;
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  // Default to 1inch Web3 (chainId 501 = Solana mainnet)
  // Uses your API_KEY for authentication automatically
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.1inch.com/web3/501";

  if (!apiKey) {
    throw new Error("Missing required environment variable: API_KEY");
  }

  if (!privateKey) {
    throw new Error("Missing required environment variable: SOLANA_PRIVATE_KEY");
  }

  return { apiKey, privateKey, rpcUrl };
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET AND CONNECTION CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a Solana connection and wallet keypair from configuration.
 *
 * Connection commitment levels:
 * - "processed": Transaction seen by RPC, may roll back (fastest)
 * - "confirmed": 66% of validators have confirmed (recommended)
 * - "finalized": ~32 blocks deep, extremely unlikely to roll back (slowest)
 *
 * We use "confirmed" as a good balance of speed and reliability.
 *
 * @param config - Configuration object
 * @returns Object containing Connection and Keypair instances
 * @throws Error if private key format is invalid
 */
export function createWallet(config: Config): { connection: Connection; wallet: Keypair } {
  // Check if using 1inch Web3 (requires Authorization header)
  const is1inchGateway = config.rpcUrl.includes("api.1inch.com/web3");

  // Create connection with "confirmed" commitment level
  // This means we'll wait for 66% of validators to confirm transactions
  //
  // For 1inch Web3 gateway:
  // - HTTP uses Bearer token in Authorization header
  // - WebSocket uses apiKey query parameter
  const wsEndpoint = is1inchGateway ? `wss://api.1inch.com/web3/501?apiKey=${config.apiKey}` : undefined;

  const connection = new Connection(config.rpcUrl, {
    commitment: "confirmed",
    // Add Authorization header for HTTP requests
    httpHeaders: is1inchGateway ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    // Configure WebSocket endpoint with apiKey for 1inch Gateway
    wsEndpoint
  });

  // Decode the secret key (supports both base58 and base64 formats)
  // Solana keypairs are 64 bytes: 32-byte secret key + 32-byte public key
  let secretKey: Uint8Array;
  try {
    // Try base58 first (Solana's native format)
    secretKey = bs58.decode(config.privateKey);
    if (secretKey.length !== 64) {
      throw new Error("Invalid key length from base58");
    }
  } catch {
    // Fall back to base64 (alternative format)
    try {
      secretKey = Buffer.from(config.privateKey, "base64");
      if (secretKey.length !== 64) {
        throw new Error("Invalid key length from base64");
      }
    } catch {
      throw new Error(
        "Invalid SOLANA_PRIVATE_KEY format. Expected base58 or base64-encoded 64-byte secret key. " +
          "You can export this from your Solana wallet or generate with solana-keygen."
      );
    }
  }

  // Create Keypair from the secret key
  // This gives us both signing capability and the public key (address)
  const wallet = Keypair.fromSecretKey(secretKey);
  return { connection, wallet };
}

// ═══════════════════════════════════════════════════════════════════════════
// SDK INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates and configures the Solana Fusion SDK instance.
 *
 * The Solana SDK uses a different architecture than EVM:
 * - HTTP-only communication (no blockchain provider needed for SDK)
 * - Order creation returns instructions for on-chain transaction
 * - User broadcasts transaction themselves (not relayer)
 *
 * Methods available:
 * - createOrder(): Create a FusionOrder for escrow
 * - getOrderStatus(): Check if order has been filled
 * - (Signing and broadcasting done via @solana/web3.js)
 *
 * @param config - Configuration object from loadConfig()
 * @returns Object containing SDK, connection, and wallet
 */
export function createSolanaSDK(config: Config): {
  sdk: Sdk;
  connection: Connection;
  wallet: Keypair;
} {
  // Create connection and wallet for transaction signing
  const { connection, wallet } = createWallet(config);

  // Create SDK with HTTP provider
  // The SDK only does HTTP calls to 1inch API - blockchain interaction
  // is handled separately via @solana/web3.js
  const sdk = new Sdk(new AxiosHttpProvider(), {
    // Base URL for 1inch Fusion API
    baseUrl: "https://api.1inch.com/fusion",
    // API key for authentication
    authKey: config.apiKey,
    // API version
    version: "v1.0"
  });

  return { sdk, connection, wallet };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pauses execution for a specified duration.
 * Used for polling order status without overwhelming the API.
 *
 * Note: Solana has ~400ms block times (vs EVM's 12s), so you can poll
 * more frequently. We recommend 2-3 second intervals.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats a lamport amount to human-readable SOL string.
 *
 * 1 SOL = 1,000,000,000 lamports (10^9)
 * Compare to ETH: 1 ETH = 10^18 wei
 *
 * @param lamports - Amount in lamports
 * @returns Formatted string with 9 decimal places
 */
export function formatSol(lamports: number | bigint): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(9);
}

/**
 * Formats an SPL token amount from smallest units to human-readable string.
 *
 * Note: SPL tokens have varying decimals:
 * - USDC: 6 decimals
 * - JUP: 6 decimals
 * - BONK: 5 decimals
 * Always check the token's decimals before formatting!
 *
 * @param amount - Amount in smallest units
 * @param decimals - Token decimals
 * @returns Formatted string with up to 6 decimal places
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  return `${integerPart}.${fractionalStr.slice(0, 6)}`;
}

/**
 * Converts a 1inch SDK Address to a Solana PublicKey.
 *
 * The SDK uses its own Address type internally.
 * This helper converts to the standard @solana/web3.js PublicKey
 * for use with transactions and other Solana operations.
 *
 * @param address - 1inch SDK Address instance
 * @returns Solana PublicKey instance
 */
export function toPublicKey(address: Address): import("@solana/web3.js").PublicKey {
  // Dynamic import to avoid circular dependencies
  const { PublicKey } = require("@solana/web3.js");
  // Address.toBuffer() returns the raw 32-byte public key
  return new PublicKey(address.toBuffer());
}

/**
 * Confirms a transaction using HTTP-only polling (no WebSocket).
 *
 * This is useful when using RPC providers that don't support WebSocket
 * authentication (like 1inch Web3 gateway). The built-in confirmTransaction
 * uses WebSocket subscriptions which may fail with 401 errors.
 *
 * @param connection - Solana Connection instance
 * @param signature - Transaction signature to confirm
 * @param timeoutMs - Maximum time to wait (default: 60 seconds)
 * @param pollIntervalMs - Interval between status checks (default: 2 seconds)
 * @returns Confirmation result
 * @throws Error if transaction fails or times out
 */
export async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  timeoutMs = 60000,
  pollIntervalMs = 2000
): Promise<{ confirmed: boolean; slot?: number }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const { value: statuses } = await connection.getSignatureStatuses([signature]);
    const status = statuses[0];

    if (status) {
      // Check for errors
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }

      // Check if confirmed (confirmationStatus: "confirmed" or "finalized")
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
        return { confirmed: true, slot: status.slot };
      }
    }

    // Wait before next poll
    await sleep(pollIntervalMs);
  }

  throw new Error(`Transaction confirmation timeout after ${timeoutMs}ms`);
}
