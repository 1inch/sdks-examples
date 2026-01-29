/**
 * viem Provider Implementation
 *
 * This module implements the EVMProvider interface using viem.
 * Use this if you prefer viem for your Ethereum interactions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { createProvider } from "./providers/viem.js";
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

import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  mainnet,
  base,
  bsc,
  polygon,
  arbitrum,
  optimism,
  avalanche,
  gnosis,
  fantom,
  zkSync,
  linea,
  sonic
} from "viem/chains";
import type { Web3Like } from "@1inch/fusion-sdk";
import { Config, ERC20_ABI_VIEM, is1inchGateway, type Hex, type Address } from "../shared/types.js";
import type { EVMProvider } from "./interface.js";

// Chain ID to viem Chain mapping
const VIEM_CHAIN_MAP: Record<string, Chain> = {
  "1": mainnet,
  "8453": base,
  "56": bsc,
  "137": polygon,
  "42161": arbitrum,
  "10": optimism,
  "43114": avalanche,
  "100": gnosis,
  "250": fantom,
  "324": zkSync,
  "59144": linea,
  "146": sonic
  // Note: Unichain (130) not yet available in viem/chains
};

/**
 * Creates an EVMProvider using viem.
 *
 * This factory function:
 * 1. Creates viem public and wallet clients with optional 1inch Gateway auth
 * 2. Creates an account from the private key
 * 3. Creates a Web3Like adapter for the Fusion SDK
 * 4. Returns an EVMProvider implementation
 *
 * NOTE: SDK initialization is NOT done here - use createFusionSDK() from
 * shared/types.js with the provider.web3Like adapter.
 *
 * @param config - Configuration from loadConfig()
 * @returns EVMProvider implementation using viem
 */
export async function createProvider(config: Config): Promise<EVMProvider> {
  // Get viem chain
  const chain = VIEM_CHAIN_MAP[config.networkId];
  if (!chain) {
    const supported = Object.keys(VIEM_CHAIN_MAP).join(", ");
    throw new Error(`Unsupported network ID: ${config.networkId}. Supported: ${supported}`);
  }

  // Create account from private key
  const account = privateKeyToAccount(config.privateKey as Hex);

  // Configure transport with optional auth header
  const transportOptions = is1inchGateway(config.rpcUrl)
    ? {
        fetchOptions: {
          headers: {
            Authorization: `Bearer ${config.apiKey}`
          }
        }
      }
    : undefined;

  // Create public client for read operations
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, transportOptions)
  });

  // Create wallet client for write operations
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl, transportOptions)
  });

  // Create Web3Like adapter for Fusion SDK
  // This is the ONLY library-specific part needed by the SDK
  const web3Like: Web3Like = {
    eth: {
      async call(transactionConfig): Promise<string> {
        const result = await publicClient.call({
          to: transactionConfig.to as Hex,
          data: transactionConfig.data as Hex
        });
        return result.data || "0x";
      }
    },
    extend(): void {
      // No-op: required by Web3Like interface
    }
  };

  // Return EVMProvider implementation
  return {
    address: account.address,
    web3Like,

    async getNativeBalance(address: string): Promise<bigint> {
      return publicClient.getBalance({ address: address as Address });
    },

    async getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<bigint> {
      return publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI_VIEM,
        functionName: "balanceOf",
        args: [ownerAddress as Address]
      });
    },

    async getTokenAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<bigint> {
      return publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI_VIEM,
        functionName: "allowance",
        args: [ownerAddress as Address, spenderAddress as Address]
      });
    },

    async approveToken(tokenAddress: string, spenderAddress: string, amount: bigint): Promise<string> {
      return walletClient.writeContract({
        account,
        chain,
        address: tokenAddress as Address,
        abi: ERC20_ABI_VIEM,
        functionName: "approve",
        args: [spenderAddress as Address, amount]
      });
    },

    async waitForTransaction(txHash: string): Promise<void> {
      await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
    }
  };
}

// Re-export types for convenience
export type { EVMProvider } from "./interface.js";
