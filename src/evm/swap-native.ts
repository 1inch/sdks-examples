/**
 * 1inch Intent Swap Example: Native Token (ETH) to ERC-20
 *
 * This example demonstrates how to swap native ETH for an ERC-20 token
 * using the 1inch Fusion SDK. It uses a provider-agnostic interface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVIDER AGNOSTIC DESIGN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * To switch providers, simply change the import:
 *
 *   // Use ethers.js:
 *   import { createProvider } from "./providers/ethers.js";
 *
 *   // OR use viem:
 *   import { createProvider } from "./providers/viem.js";
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NATIVE TOKEN HANDLING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Native tokens (ETH, MATIC, BNB, etc.) are special because they're not
 * ERC-20 tokens. The 1inch SDK uses a sentinel address to represent them:
 *   0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
 *
 * Key differences from ERC-20 swaps:
 * - No approval step needed
 * - Use getNativeBalance() instead of getTokenBalance()
 * - Must deploy an escrow contract on-chain (using NativeOrdersFactory)
 * - Requires a transaction to lock the native token in the escrow
 *
 * Example: Swap 0.001 ETH to USDC on Ethereum mainnet
 */

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ PROVIDER SELECTION - Change this import to switch libraries              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
import { createProvider } from "./providers/ethers.js";
// import { createProvider } from "./providers/viem.js";

import { Address, NativeOrdersFactory, OrderStatus } from "@1inch/fusion-sdk";
import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import {
  loadConfig,
  createFusionSDK,
  TOKENS,
  sleep,
  formatAmount,
  is1inchGateway,
  NETWORK_MAP
} from "./shared/types.js";

// ============================================================================
// CONFIGURATION - Modify these values for your swap
// ============================================================================

const SWAP_CONFIG = {
  // Source token: Native ETH
  fromTokenAddress: TOKENS.ethereum.NATIVE,
  fromTokenDecimals: 18,
  fromTokenSymbol: "ETH",

  // Destination token: USDC
  toTokenAddress: TOKENS.ethereum.USDC,
  toTokenDecimals: 6,
  toTokenSymbol: "USDC",

  // Amount to swap: 0.001 ETH (10^15 wei)
  amount: "1000000000000000",

  // Timing configuration
  orderTimeout: 300_000,
  pollInterval: 3_000
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: Native ETH to ERC-20");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const provider = await createProvider(config);
  const sdk = createFusionSDK(config, provider.web3Like);

  console.log(`   Wallet: ${provider.address}`);
  console.log(`   Network: ${config.networkId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: BALANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  // For native tokens, use getNativeBalance() instead of getTokenBalance()
  console.log("\n💰 Checking ETH balance...");
  const balance = await provider.getNativeBalance(provider.address);
  const amountBigInt = BigInt(SWAP_CONFIG.amount);

  console.log(`   ETH balance: ${formatAmount(balance, 18)} ETH`);
  console.log(`   Amount to swap: ${formatAmount(amountBigInt, 18)} ETH`);

  // Reserve some ETH for gas (even though Fusion is gasless, good practice)
  const gasBuffer = BigInt("5000000000000000"); // 0.005 ETH
  const totalNeeded = amountBigInt + gasBuffer;

  if (balance < totalNeeded) {
    throw new Error(
      `Insufficient ETH balance. Have: ${formatAmount(balance, 18)} ETH, ` +
        `Need: ${formatAmount(totalNeeded, 18)} ETH (including gas buffer)`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTE: NO APPROVAL STEP NEEDED FOR NATIVE TOKENS!
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔓 Native tokens don't require approval - skipping...");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: GET QUOTE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📊 Getting quote...");
  const quoteParams = {
    fromTokenAddress: SWAP_CONFIG.fromTokenAddress,
    toTokenAddress: SWAP_CONFIG.toTokenAddress,
    amount: SWAP_CONFIG.amount,
    walletAddress: provider.address,
    source: "sdk-tutorial"
  };

  const quote = await sdk.getQuote(quoteParams);
  const recommendedPreset = quote.presets[quote.recommendedPreset];

  if (!recommendedPreset) {
    throw new Error(`Preset "${quote.recommendedPreset}" not found in quote response`);
  }

  console.log(`   Recommended preset: ${quote.recommendedPreset}`);
  console.log(
    `   Expected output (start): ${formatAmount(BigInt(recommendedPreset.auctionStartAmount), SWAP_CONFIG.toTokenDecimals)} ${SWAP_CONFIG.toTokenSymbol}`
  );
  console.log(
    `   Expected output (end): ${formatAmount(BigInt(recommendedPreset.auctionEndAmount), SWAP_CONFIG.toTokenDecimals)} ${SWAP_CONFIG.toTokenSymbol}`
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: CREATE AND SUBMIT ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  // For native token swaps, we need to:
  // 1. Create the order via SDK
  // 2. Submit to relayer to register the order
  console.log("\n📝 Creating order...");
  const preparedOrder = await sdk.createOrder(quoteParams);

  console.log("   Submitting native order to relayer...");
  const makerAddress = new Address(provider.address);
  const orderInfo = await sdk.submitNativeOrder(preparedOrder.order, makerAddress, preparedOrder.quoteId);

  console.log(`   Order hash: ${orderInfo.orderHash}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: DEPLOY ESCROW CONTRACT ON-CHAIN
  // ═══════════════════════════════════════════════════════════════════════════
  // Native token swaps require an on-chain escrow to hold the ETH.
  // The escrow wraps ETH to WETH and locks it until the order is filled.
  console.log("\n🔐 Deploying escrow contract...");

  // Create ethers wallet for sending the transaction
  let ethersProvider: JsonRpcProvider;
  if (is1inchGateway(config.rpcUrl)) {
    const fetchRequest = new FetchRequest(config.rpcUrl);
    fetchRequest.setHeader("Authorization", `Bearer ${config.apiKey}`);
    ethersProvider = new JsonRpcProvider(fetchRequest);
  } else {
    ethersProvider = new JsonRpcProvider(config.rpcUrl);
  }
  const wallet = new Wallet(config.privateKey, ethersProvider);

  // Get the NativeOrdersFactory for the current network
  const network = NETWORK_MAP[config.networkId];
  const factory = NativeOrdersFactory.default(network);

  // Build the escrow creation call
  const call = factory.create(makerAddress, orderInfo.order);

  // Send the transaction to deploy the escrow
  const txRes = await wallet.sendTransaction({
    to: call.to.toString(),
    data: call.data,
    value: call.value
  });

  console.log(`   Escrow tx: ${txRes.hash}`);
  console.log("   Waiting for confirmation...");

  await txRes.wait();
  console.log(`   ✅ Escrow deployed! Order is now active.`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: POLL FOR COMPLETION
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n⏳ Waiting for order to be filled...");
  const startTime = Date.now();

  while (Date.now() - startTime < SWAP_CONFIG.orderTimeout) {
    try {
      const status = await sdk.getOrderStatus(orderInfo.orderHash);

      switch (status.status) {
        case OrderStatus.Filled:
          console.log("\n🎉 Order filled successfully!");
          console.log("   Fills:", JSON.stringify(status.fills, null, 2));
          console.log(`   Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
          return;

        case OrderStatus.Expired:
          throw new Error("Order expired without being filled");

        case OrderStatus.Cancelled:
          throw new Error("Order was cancelled");

        default:
          process.stdout.write(".");
          await sleep(SWAP_CONFIG.pollInterval);
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("Order")) {
        throw error;
      }
      console.log("\n   ⚠️ Status check failed, retrying...");
      await sleep(SWAP_CONFIG.pollInterval);
    }
  }

  throw new Error(`Order timeout after ${SWAP_CONFIG.orderTimeout / 1000}s`);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main()
  .then(() => {
    console.log("\n✅ Example completed successfully!");
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response?: { data?: unknown } }).response;
      if (response?.data) {
        console.error("   API Response:", JSON.stringify(response.data, null, 2));
      }
    }
    process.exit(1);
  });
