/**
 * ethers.js Provider Implementation
 *
 * This module implements the EVMProvider interface using ethers.js v6.
 * Use this if you prefer ethers.js for your Ethereum interactions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { createProvider } from "./providers/ethers.js";
 * import { loadConfig, createFusionSDK } from "./shared/types.js";
 *
 * const config = loadConfig();
 * const provider = await createProvider(config);
 * const sdk = createFusionSDK(config, provider.web3Like);
 *
 * // Now use the provider-agnostic interface
 * const balance = await provider.getTokenBalance(tokenAddress, provider.address);
 * ```
 */

import { Contract, FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import type { Web3Like } from "@1inch/fusion-sdk";
import { Config, ERC20_ABI, is1inchGateway } from "../shared/types.js";
import type { EVMProvider } from "./interface.js";

/**
 * Creates an EVMProvider using ethers.js.
 *
 * This factory function:
 * 1. Creates an ethers.js provider with optional 1inch Gateway auth
 * 2. Creates a wallet from the private key
 * 3. Creates a Web3Like adapter for the Fusion SDK
 * 4. Returns an EVMProvider implementation
 *
 * NOTE: SDK initialization is NOT done here - use createFusionSDK() from
 * shared/types.js with the provider.web3Like adapter.
 *
 * @param config - Configuration from loadConfig()
 * @returns EVMProvider implementation using ethers.js
 */
export async function createProvider(config: Config): Promise<EVMProvider> {
  // Create ethers.js provider
  let jsonRpcProvider: JsonRpcProvider;

  if (is1inchGateway(config.rpcUrl)) {
    // 1inch Web3 requires Authorization header
    const fetchRequest = new FetchRequest(config.rpcUrl);
    fetchRequest.setHeader("Authorization", `Bearer ${config.apiKey}`);
    jsonRpcProvider = new JsonRpcProvider(fetchRequest);
  } else {
    jsonRpcProvider = new JsonRpcProvider(config.rpcUrl);
  }

  // Create wallet from private key
  const wallet = new Wallet(config.privateKey, jsonRpcProvider);

  // Create Web3Like adapter for Fusion SDK
  // This is the ONLY library-specific part needed by the SDK
  const web3Like: Web3Like = {
    eth: {
      call(transactionConfig): Promise<string> {
        return jsonRpcProvider.call(transactionConfig);
      }
    },
    extend(): void {
      // No-op: required by Web3Like interface
    }
  };

  // Return EVMProvider implementation
  return {
    address: wallet.address,
    web3Like,

    async getNativeBalance(address: string): Promise<bigint> {
      return jsonRpcProvider.getBalance(address);
    },

    async getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<bigint> {
      const contract = new Contract(tokenAddress, ERC20_ABI, jsonRpcProvider);
      return contract.balanceOf(ownerAddress);
    },

    async getTokenAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<bigint> {
      const contract = new Contract(tokenAddress, ERC20_ABI, jsonRpcProvider);
      return contract.allowance(ownerAddress, spenderAddress);
    },

    async approveToken(tokenAddress: string, spenderAddress: string, amount: bigint): Promise<string> {
      const contract = new Contract(tokenAddress, ERC20_ABI, wallet);
      const tx = await contract.approve(spenderAddress, amount);
      return tx.hash;
    },

    async waitForTransaction(txHash: string): Promise<void> {
      await jsonRpcProvider.waitForTransaction(txHash);
    }
  };
}

// Re-export types for convenience
export type { EVMProvider } from "./interface.js";
