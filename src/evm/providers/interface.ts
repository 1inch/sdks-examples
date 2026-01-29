/**
 * EVM Provider Interface - Library-Agnostic Abstraction
 *
 * This interface defines a common contract for EVM blockchain interactions.
 * Both ethers.js and viem implementations conform to this interface, allowing
 * example code to be written once and work with any provider library.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The design separates concerns:
 *
 * 1. EVMProvider (this file): Library-specific blockchain operations
 *    - Token balances, allowances, approvals
 *    - Exposes web3Like adapter for SDK
 *
 * 2. createFusionSDK (shared/types.ts): SDK initialization
 *    - Uses the web3Like adapter from any provider
 *    - Identical for all provider implementations
 *
 * This separation demonstrates that the Fusion SDK is truly provider-agnostic!
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * // Choose your provider implementation:
 * import { createProvider } from "./providers/ethers.js";
 * // OR
 * import { createProvider } from "./providers/viem.js";
 *
 * import { loadConfig, createFusionSDK } from "./shared/types.js";
 *
 * const config = loadConfig();
 * const provider = await createProvider(config);
 * const sdk = createFusionSDK(config, provider.web3Like);
 *
 * // Use the same API regardless of library
 * const balance = await provider.getTokenBalance(tokenAddress, provider.address);
 * ```
 */

import type { Web3Like } from "@1inch/fusion-sdk";

/**
 * Provider-agnostic interface for EVM blockchain interactions.
 *
 * Implementations handle the library-specific details while exposing
 * a consistent API for:
 * - Reading token balances and allowances
 * - Writing approval transactions
 * - Providing a Web3Like adapter for the Fusion SDK
 */
export interface EVMProvider {
  // ═══════════════════════════════════════════════════════════════════════════
  // ACCOUNT INFORMATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** The wallet address associated with this provider */
  readonly address: string;

  /** The Web3Like adapter for use with the Fusion SDK */
  readonly web3Like: Web3Like;

  // ═══════════════════════════════════════════════════════════════════════════
  // READ OPERATIONS (No gas cost)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the native token balance (ETH, MATIC, etc.) of an address.
   *
   * @param address - The address to check
   * @returns Balance in wei (smallest unit)
   */
  getNativeBalance(address: string): Promise<bigint>;

  /**
   * Gets the ERC-20 token balance of an address.
   *
   * @param tokenAddress - The token contract address
   * @param ownerAddress - The address to check
   * @returns Balance in token's smallest unit
   */
  getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<bigint>;

  /**
   * Gets the ERC-20 token allowance for a spender.
   *
   * @param tokenAddress - The token contract address
   * @param ownerAddress - The token owner's address
   * @param spenderAddress - The spender's address (e.g., router contract)
   * @returns Allowance amount in token's smallest unit
   */
  getTokenAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<bigint>;

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE OPERATIONS (Requires gas)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Approves a spender to transfer tokens on behalf of the owner.
   *
   * @param tokenAddress - The token contract address
   * @param spenderAddress - The address to approve (e.g., router contract)
   * @param amount - The amount to approve (in smallest unit)
   * @returns Transaction hash
   */
  approveToken(tokenAddress: string, spenderAddress: string, amount: bigint): Promise<string>;

  /**
   * Waits for a transaction to be confirmed.
   *
   * @param txHash - The transaction hash to wait for
   * @returns Promise that resolves when transaction is confirmed
   */
  waitForTransaction(txHash: string): Promise<void>;
}

/**
 * Factory function type for creating provider instances.
 * Both ethers.js and viem implementations export this function.
 */
export type CreateProviderFn = (config: import("../shared/types.js").Config) => Promise<EVMProvider>;
