/**
 * 1inch Intent Swap Example: ERC-20 to ERC-20
 *
 * This example demonstrates how to swap one ERC-20 token for another
 * using the 1inch Fusion SDK. It uses a provider-agnostic interface,
 * so you can easily switch between ethers.js and viem.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PROVIDER AGNOSTIC DESIGN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This example demonstrates that the Fusion SDK is truly library-agnostic:
 *
 * 1. Provider: Handles library-specific blockchain operations (ethers/viem)
 * 2. SDK: Created with provider.web3Like - works with ANY provider
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
 * WHAT IS FUSION/INTENT SWAP?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fusion (Intent Swap) is a gasless, MEV-protected swap mechanism where:
 *
 * 1. USER creates an "intent" (order) specifying what they want to swap
 * 2. RESOLVERS (market makers) compete to fill the order at the best price
 * 3. The swap uses a DUTCH AUCTION mechanism - price starts high and
 *    decreases over time, incentivizing resolvers to fill quickly
 * 4. USER pays NO GAS - resolvers pay gas and are compensated from the spread
 *
 * Example: Swap 1 USDC to 1INCH on Ethereum mainnet
 */

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ PROVIDER SELECTION - Change this import to switch libraries              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
import { OrderStatus } from "@1inch/fusion-sdk";
import { createProvider } from "./providers/ethers.js";
// import { createProvider } from "./providers/viem.js";

import { loadConfig, createFusionSDK, TOKENS, CONTRACTS, sleep, formatAmount } from "./shared/types.js";

// ============================================================================
// CONFIGURATION - Modify these values for your swap
// ============================================================================

const SWAP_CONFIG = {
  // Source token: USDC (6 decimals)
  fromTokenAddress: TOKENS.ethereum.USDC,
  fromTokenDecimals: 6,
  fromTokenSymbol: "USDC",

  // Destination token: 1INCH
  toTokenAddress: TOKENS.ethereum["1INCH"],
  toTokenDecimals: 18,
  toTokenSymbol: "1INCH",

  // Amount to swap: 1 USDC (6 decimals = 10^6)
  amount: "1000000",

  // Order timeout and poll interval
  orderTimeout: 300_000,
  pollInterval: 3_000
};

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("1inch Intent Swap: ERC-20 to ERC-20");
  console.log("=".repeat(60));

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Load configuration
  // 2. Create provider (library-specific: ethers or viem)
  // 3. Create SDK (library-agnostic: uses provider.web3Like)
  console.log("\n📋 Loading configuration...");
  const config = loadConfig();
  const provider = await createProvider(config);
  const sdk = createFusionSDK(config, provider.web3Like);

  console.log(`   Wallet: ${provider.address}`);
  console.log(`   Network: ${config.networkId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: BALANCE CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n💰 Checking token balance...");
  const balance = await provider.getTokenBalance(SWAP_CONFIG.fromTokenAddress, provider.address);
  const amountBigInt = BigInt(SWAP_CONFIG.amount);

  console.log(`   ${SWAP_CONFIG.fromTokenSymbol} balance: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}`);
  console.log(`   Amount to swap: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`);

  if (balance < amountBigInt) {
    throw new Error(
      `Insufficient ${SWAP_CONFIG.fromTokenSymbol} balance. ` +
        `Have: ${formatAmount(balance, SWAP_CONFIG.fromTokenDecimals)}, ` +
        `Need: ${formatAmount(amountBigInt, SWAP_CONFIG.fromTokenDecimals)}`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: TOKEN ALLOWANCE (APPROVAL)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n🔓 Checking token allowance...");
  const allowance = await provider.getTokenAllowance(
    SWAP_CONFIG.fromTokenAddress,
    provider.address,
    CONTRACTS.AGGREGATION_ROUTER_V6
  );

  console.log(`   Current allowance: ${formatAmount(allowance, SWAP_CONFIG.fromTokenDecimals)}`);

  if (allowance < amountBigInt) {
    console.log("   Approving tokens...");
    const txHash = await provider.approveToken(
      SWAP_CONFIG.fromTokenAddress,
      CONTRACTS.AGGREGATION_ROUTER_V6,
      amountBigInt
    );

    console.log(`   Approval tx: ${txHash}`);
    console.log("   Waiting for confirmation...");
    await provider.waitForTransaction(txHash);
    console.log("   ✅ Approval confirmed!");
  } else {
    console.log("   ✅ Allowance sufficient");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: GET QUOTE
  // ═══════════════════════════════════════════════════════════════════════════
  // The SDK is library-agnostic - it uses the web3Like adapter from the provider
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
  // STEP 5: CREATE AND SUBMIT ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📝 Creating order...");
  const preparedOrder = await sdk.createOrder(quoteParams);

  console.log("   Submitting order to relayer...");
  const orderInfo = await sdk.submitOrder(preparedOrder.order, preparedOrder.quoteId);

  console.log(`   ✅ Order submitted!`);
  console.log(`   Order hash: ${orderInfo.orderHash}`);

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
